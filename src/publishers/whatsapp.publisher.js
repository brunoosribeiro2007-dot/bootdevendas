const pino = require('pino');
const env = require('../config/env');
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');

class WhatsappPublisher {
  constructor() {
    this.sock = null;
    this.latestQr = null;
    this.latestPairingCode = null;
    this.isReady = false;
    this.initStatus = 'Aguardando...';
    this.logs = [];
    this.authPath = path.resolve(process.cwd(), '.baileys_auth');
    this.sessionFilesMtime = new Map(); // Cache local dos tempos de modificação dos arquivos
    
    if (!fs.existsSync(this.authPath)) {
        try { fs.mkdirSync(this.authPath, { recursive: true }); } catch (e) {}
    }
  }

  // 🔄 CARREGAR SESSÃO DO NEON PARA O DISCO
  async restoreSessionFromNeon() {
      const { getAllSessionFiles } = require('../database/init');
      this.addLog('📥 Recuperando login salvo no Neon.tech...');
      try {
          const files = await getAllSessionFiles();
          if (files.length === 0) {
              this.addLog('⚠️ Nenhuma sessão anterior encontrada no Neon.');
              return false;
          }
          
          this.sessionFilesMtime.clear();
          for (const file of files) {
              const filePath = path.join(this.authPath, file.id);
              fs.writeFileSync(filePath, file.data);
              try {
                  const stats = fs.statSync(filePath);
                  this.sessionFilesMtime.set(file.id, stats.mtimeMs);
              } catch (e) {}
          }
          this.addLog('✅ Login recuperado com sucesso do banco externo!');
          return true;
      } catch (e) {
          this.addLog('❌ Falha ao carregar sessão do banco.');
          return false;
      }
  }

  // 📤 SALVAR SESSÃO DO DISCO PARA O NEON (Sync incremental otimizado)
  async syncSessionToNeon() {
      const { saveSessionFile } = require('../database/init');
      try {
          if (!fs.existsSync(this.authPath)) return;
          const files = fs.readdirSync(this.authPath);
          
          let syncCount = 0;
          for (const file of files) {
              const filePath = path.join(this.authPath, file);
              if (fs.lstatSync(filePath).isFile()) {
                  const stats = fs.statSync(filePath);
                  const mtime = stats.mtimeMs;
                  
                  // Se o arquivo não mudou desde o último sync, pulamos para não congestionar o pool do Postgres
                  if (this.sessionFilesMtime.get(file) === mtime) {
                      continue;
                  }
                  
                  const data = fs.readFileSync(filePath); // Lendo como Buffer (Binário)
                  await saveSessionFile(file, data);
                  this.sessionFilesMtime.set(file, mtime);
                  syncCount++;
              }
          }
          if (syncCount > 0) {
              logger.info(`📤 Sincronizados ${syncCount} arquivos de sessão modificados para o Neon.`);
          }
      } catch (e) {
          logger.warn(`Erro na sincronização total: ${e.message}`);
      }
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 20) this.logs.pop(); // Aumentado para 20
    logger.info(msg);
  }

  async initialize() {
    this.latestQr = null;
    this.latestPairingCode = null;
    this._cachedGroupId = null; // Reset cache do grupo no reconnect

    // Evita múltiplas instâncias rodando juntas (Causa erro 405)
    if (this.sock) {
        try { 
            this.sock.ev.removeAllListeners(); 
            this.sock.end();
        } catch(e) {}
        this.sock = null;
    }

    // TENTA RESTAURAR ANTES DE LIGAR O MOTOR
    await this.restoreSessionFromNeon();

    this.addLog('⚙️ Iniciando motor (Conexão Persistente)...');
    try {
        const baileys = await import('@whiskeysockets/baileys');
        const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = baileys;
        const { Boom } = await import('@hapi/boom');

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
          version,
          auth: state,
          logger: pino({ level: 'silent' }),
          connectTimeoutMs: 60000,
          printQRInTerminal: true
        });

        // SALVA NO BANCO SEMPRE QUE O LOGIN MUDA
        this.sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                await this.syncSessionToNeon(); // Sincroniza tudo
            } catch (err) {
                logger.error('Erro ao sincronizar credenciais:', err);
            }
        });

        this.sock.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr) {
            this.latestQr = qr;
            this.initStatus = 'QR Code Pronto!';
            this.addLog('📱 QR Code gerado.');
          }

          if (connection === 'close') {
            // Extração segura do statusCode (previne crash se lastDisconnect/error for null)
            let statusCode = 0;
            try {
                if (lastDisconnect && lastDisconnect.error) {
                    statusCode = (lastDisconnect.error instanceof Boom) 
                        ? lastDisconnect.error.output?.statusCode 
                        : (lastDisconnect.error.output?.statusCode || 0);
                }
            } catch (e) {
                logger.warn('Erro ao extrair statusCode:', e.message);
            }
            
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOut;
            
            this.isReady = false;
            
            if (statusCode === 408) {
                this.addLog(`⏳ Timeout de conexão (408). Reconectando em 15s...`);
                this.initStatus = 'Reconectando (timeout)...';
                setTimeout(() => this.initialize(), 15000);
            } else if (statusCode === 515 || statusCode === 503) {
                this.addLog(`⏳ Servidor WhatsApp indisponível/Restart (${statusCode}). Reconectando em 5s...`);
                this.initStatus = 'Reconectando (515)...';
                setTimeout(() => this.initialize(), 5000);
            } else if (shouldReconnect) {
                this.addLog(`❌ Conexão fechada (Motivo: ${statusCode}). Reconectando em 20s...`);
                this.initStatus = 'Reconectando...';
                setTimeout(() => this.initialize(), 20000);
            } else {
                this.initStatus = 'Sessão Inválida (Limpando...)';
                // Se foi deslogado, precisamos limpar tudo para gerar novo QR
                const { db } = require('../database/init');
                db.run('DELETE FROM sessions', []).catch(() => {});
                this.sessionFilesMtime.clear(); // Limpa cache local
                try {
                    if (fs.existsSync(this.authPath)) {
                        fs.rmSync(this.authPath, { recursive: true, force: true });
                    }
                } catch (e) {}
                this.addLog('⚠️ Sessão limpa devido a logout. Reiniciando para novo pareamento...');
                setTimeout(() => this.initialize(), 5000);
            }
          } else if (connection === 'open') {
            this.initStatus = '✅ Conectado!';
            this.isReady = true;
            this.latestQr = null;
            this.latestPairingCode = null;
            this.addLog('✅ Conexão realizada com sucesso! Bot pronto para publicações.');
            
            // Sincroniza a sessão após conectar com sucesso
            this.syncSessionToNeon().catch(err => logger.warn('Erro ao sincronizar sessão após conexão:', err.message));
          }
        });
    } catch (err) {
        this.addLog(`❌ Erro no boot: ${err.message}`);
    }
  }

  async triggerPairing(phoneNumber) {
    if (!this.sock) return null;
    try {
        const num = phoneNumber.replace(/\D/g, '');
        const code = await this.sock.requestPairingCode(num);
        this.latestPairingCode = code;
        this.addLog(`🔑 Código gerado para ${num}: ${code}`);
        return code;
    } catch (e) {
        this.addLog(`❌ Falha no código: ${e.message}`);
        return null;
    }
  }

  async getChatId() {
    const targetNumber = env.whatsappTargetNumber;
    const targetGroup = env.whatsappTargetGroup;
    let chatId = null;

    if (targetGroup) {
        if (targetGroup.endsWith('@g.us')) {
            chatId = targetGroup;
        } else if (this._cachedGroupId) {
            chatId = this._cachedGroupId;
        } else {
            try {
                const groups = await this.sock.groupFetchAllParticipating();
                const groupName = targetGroup.toLowerCase().trim();
                let group = Object.values(groups).find(g => g.subject.toLowerCase().trim() === groupName);
                if (!group) {
                    group = Object.values(groups).find(g => g.subject.toLowerCase().includes(groupName) || groupName.includes(g.subject.toLowerCase()));
                }
                if (group) {
                    chatId = group.id;
                    this._cachedGroupId = chatId;
                    logger.info(`✅ Grupo encontrado: "${group.subject}" (${chatId})`);
                } else {
                    const availableGroups = Object.values(groups).map(g => `"${g.subject}" (ID: ${g.id})`).join(', ');
                    logger.warn(`❌ Grupo "${targetGroup}" não encontrado. Grupos disponíveis: ${availableGroups}`);
                }
            } catch (gErr) {
                logger.error('Erro ao buscar grupos:', gErr.stack || gErr);
            }
        }
    }

    if (!chatId && targetNumber) {
        chatId = `${String(targetNumber).replace(/\D/g, '')}@s.whatsapp.net`;
    }

    return chatId;
  }

  async sendTextMessage(text) {
    if (!this.isReady || !this.sock) {
        logger.warn('⚠️ Envio de mensagem abortado: WhatsApp não está pronto');
        return false;
    }
    try {
      const chatId = await this.getChatId();
      if (!chatId) {
          logger.error('❌ Não foi possível determinar o destino para envio de texto.');
          return false;
      }
      await this.sock.sendMessage(chatId, { text });
      return true;
    } catch (error) {
      logger.error('❌ Erro ao enviar mensagem de texto no WhatsApp:', error);
      return false;
    }
  }

  async publish(item) {
    if (!this.isReady || !this.sock) {
        logger.warn(`⚠️ Publicação abortada: WhatsApp não está pronto (Ready: ${this.isReady})`);
        return false;
    }
    
    try {
      const chatId = await this.getChatId();
      if (!chatId) {
          logger.error('❌ Não foi possível determinar o destino (Grupo ou Número).');
          return false;
      }

      const displayTitle = item.title || 'Sem título';
      this.addLog(`📤 Publicando produto: ${displayTitle.substring(0, 40)}...`);
      
      // Tenta baixar a imagem previamente com timeout estrito de 8 segundos
      let imageBuffer = null;
      if (item.image_url && item.image_url.startsWith('http')) {
          try {
              const axios = require('axios');
              const imgRes = await axios.get(item.image_url, { 
                  responseType: 'arraybuffer', 
                  timeout: 8000 
              });
              if (imgRes.data) {
                  imageBuffer = Buffer.from(imgRes.data);
              }
          } catch (imgDownloadErr) {
              logger.warn(`⚠️ Falha ao baixar imagem do produto (${imgDownloadErr.message}). Prosseguindo com fallback de texto.`);
          }
      }

      if (imageBuffer) {
          try {
              await this.sock.sendMessage(chatId, {
                  image: imageBuffer,
                  caption: item.formatted_message
              });
              return true;
          } catch (sendImgErr) {
              logger.warn(`⚠️ Falha ao enviar mensagem com imagem (${sendImgErr.message}). Tentando enviar apenas texto...`);
          }
      }

      // Envia somente texto como fallback
      try {
          await this.sock.sendMessage(chatId, {
              text: item.formatted_message
          });
          return true;
      } catch (textErr) {
          logger.error('❌ Falha total ao enviar mensagem:', textErr.message);
          if (textErr.message?.includes('Connection Closed') || textErr.message?.includes('not open')) {
              this.isReady = false;
              this._cachedGroupId = null;
          }
          return false;
      }
    } catch (error) {
      logger.error('❌ Erro ao publicar mensagem no WhatsApp:', error);
      return false;
    }
  }
}

module.exports = new WhatsappPublisher();
