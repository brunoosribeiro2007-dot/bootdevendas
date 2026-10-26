const pino = require('pino');
const env = require('../config/env');
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');

const promiseTimeout = (promise, ms, errorMsg) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
};

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
    this.isInitializing = false; // Controle de concorrência na inicialização
    this.reconnectTimeout = null; // Referência para evitar agendamentos paralelos
    
    if (!fs.existsSync(this.authPath)) {
        try { fs.mkdirSync(this.authPath, { recursive: true }); } catch (e) {}
    }
  }

  // 🔄 CARREGAR SESSÃO DO SUPABASE PARA O DISCO (Bundle atômico com fallback legado)
  async restoreSessionFromPostgres() {
      const { db } = require('../database/init');
      this.addLog('📥 Recuperando login salvo no Supabase...');
      try {
          const row = await db.get('SELECT data FROM sessions WHERE id = ?', ['session_bundle']);
          if (!row || !row.data) {
              this.addLog('ℹ️ Bundle de sessão não encontrado no banco. Tentando carregamento legado...');
              return await this.restoreSessionLegacy();
          }

          let buffer = row.data;
          if (!Buffer.isBuffer(buffer)) {
              buffer = Buffer.from(buffer);
          }

          const bundle = JSON.parse(buffer.toString('utf-8'));

          // Limpa a pasta local para evitar arquivos órfãos antigos
          if (fs.existsSync(this.authPath)) {
              const localFiles = fs.readdirSync(this.authPath);
              for (const localFile of localFiles) {
                  try { fs.unlinkSync(path.join(this.authPath, localFile)); } catch (e) {}
              }
          } else {
              fs.mkdirSync(this.authPath, { recursive: true });
          }

          // Escreve os arquivos do bundle
          for (const [file, base64Data] of Object.entries(bundle)) {
              const filePath = path.join(this.authPath, file);
              fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          }

          this.addLog('✅ Login (Bundle) recuperado com sucesso do banco externo!');
          return true;
      } catch (e) {
          this.addLog(`⚠️ Falha ao carregar bundle de sessão: ${e.message}. Tentando carregamento legado...`);
          return await this.restoreSessionLegacy();
      }
  }

  // Fallback para ler sessões armazenadas no formato antigo
  async restoreSessionLegacy() {
      const { getAllSessionFiles } = require('../database/init');
      try {
          const files = await getAllSessionFiles();
          if (files.length === 0) {
              this.addLog('⚠️ Nenhuma sessão anterior encontrada no Supabase.');
              return false;
          }

          // Ignora o próprio id de bundle se ele aparecer
          const individualFiles = files.filter(f => f.id !== 'session_bundle');
          if (individualFiles.length === 0) return false;

          for (const file of individualFiles) {
              const filePath = path.join(this.authPath, file.id);
              fs.writeFileSync(filePath, file.data);
          }
          this.addLog('✅ Login legado (arquivos individuais) recuperado com sucesso!');
          return true;
      } catch (e) {
          this.addLog(`❌ Falha na restauração da sessão legada: ${e.message}`);
          return false;
      }
  }

  // 📤 SALVAR SESSÃO DO DISCO PARA O SUPABASE (Compacta tudo em 1 único bundle para evitar corrupção)
  async syncSessionToPostgres() {
      const { saveSessionFile, db } = require('../database/init');
      try {
          if (!fs.existsSync(this.authPath)) return;
          const files = fs.readdirSync(this.authPath);
          if (files.length === 0) return;

          const bundle = {};
          for (const file of files) {
              const filePath = path.join(this.authPath, file);
              if (fs.lstatSync(filePath).isFile()) {
                  const data = fs.readFileSync(filePath);
                  bundle[file] = data.toString('base64');
              }
          }

          const serialized = JSON.stringify(bundle);
          const compressed = Buffer.from(serialized, 'utf-8');

          await saveSessionFile('session_bundle', compressed);
          logger.info('📤 Sincronizado bundle de sessão completo e atômico para o Supabase.');

          // Limpa registros legados individuais para otimizar espaço no banco
          await db.run("DELETE FROM sessions WHERE id != 'session_bundle'", []);
      } catch (e) {
          logger.warn(`Erro na sincronização do bundle de sessão: ${e.message}`);
      }
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 20) this.logs.pop(); // Aumentado para 20
    logger.info(msg);
  }

  async initialize() {
    if (this.isInitializing) {
        logger.warn('⚠️ [Initialize] Inicialização do WhatsApp já em andamento. Ignorando chamada duplicada.');
        return;
    }
    this.isInitializing = true;

    try {
        this.latestQr = null;
        this.latestPairingCode = null;
        this._cachedGroupId = null; // Reset cache do grupo no reconnect

        // Cancela qualquer agendamento de reconexão pendente
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Evita múltiplas instâncias rodando juntas (Causa erro 405)
        if (this.sock) {
            try { 
                this.sock.ev.removeAllListeners(); 
                this.sock.end();
            } catch(e) {}
            this.sock = null;
        }

        // TENTA RESTAURAR ANTES DE LIGAR O MOTOR
        await this.restoreSessionFromPostgres();

        this.addLog('⚙️ Iniciando motor (Conexão Persistente)...');
        const baileys = await import('@whiskeysockets/baileys');
        const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;
        const { Boom } = await import('@hapi/boom');

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
          version,
          auth: state,
          logger: pino({ level: 'silent' }),
          connectTimeoutMs: 60000,
          printQRInTerminal: true,
          syncFullHistory: false,
          shouldSyncHistoryMessage: () => false
        });

        // SALVA NO BANCO SEMPRE QUE O LOGIN MUDA
        this.sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                await this.syncSessionToPostgres(); // Sincroniza bundle atômico
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

            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            
            if (statusCode === 408) {
                this.addLog(`⏳ Timeout de conexão (408). Reconectando em 15s...`);
                this.initStatus = 'Reconectando (timeout)...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 15000);
            } else if (statusCode === 515 || statusCode === 503) {
                this.addLog(`⏳ Servidor WhatsApp indisponível/Restart (${statusCode}). Reconectando em 5s...`);
                this.initStatus = 'Reconectando (515)...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 5000);
            } else if (shouldReconnect) {
                this.addLog(`❌ Conexão fechada (Motivo: ${statusCode}). Reconectando em 20s...`);
                this.initStatus = 'Reconectando...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 20000);
            } else {
                this.initStatus = 'Sessão Inválida (Limpando...)';
                // Se foi deslogado, precisamos limpar tudo para gerar novo QR
                const { db } = require('../database/init');
                db.run('DELETE FROM sessions', []).catch(() => {});
                try {
                    if (fs.existsSync(this.authPath)) {
                        fs.rmSync(this.authPath, { recursive: true, force: true });
                    }
                } catch (e) {}
                this.addLog('⚠️ Sessão limpa devido a logout. Reiniciando para novo pareamento...');
                this.reconnectTimeout = setTimeout(() => this.initialize(), 5000);
            }
          } else if (connection === 'open') {
            this.initStatus = '✅ Conectado!';
            this.isReady = true;
            this.latestQr = null;
            this.latestPairingCode = null;
            this.addLog('✅ Conexão realizada com sucesso! Bot pronto para publicações.');
            
            // Sincroniza a sessão após conectar com sucesso
            this.syncSessionToPostgres().catch(err => logger.warn('Erro ao sincronizar sessão após conexão:', err.message));
          }
        });
    } catch (err) {
        this.addLog(`❌ Erro no boot: ${err.message}`);
    } finally {
        this.isInitializing = false;
    }
  }

  handleTimeoutOrConnectionIssue() {
      this.isReady = false;
      this._cachedGroupId = null;
      this.addLog('⚠️ Instabilidade ou timeout detectado. Forçando reinicialização da conexão do WhatsApp...');
      if (this.sock) {
          try {
              this.sock.ev.removeAllListeners();
              this.sock.end();
          } catch (e) {}
          this.sock = null;
      }
      if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
      }
      this.reconnectTimeout = setTimeout(() => this.initialize(), 10000);
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
                const groups = await promiseTimeout(
                    this.sock.groupFetchAllParticipating(),
                    20000,
                    'Timeout ao buscar lista de grupos'
                );
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
      await promiseTimeout(
          this.sock.sendMessage(chatId, { text }),
          25000,
          'Timeout ao enviar mensagem de texto no WhatsApp'
      );
      return true;
    } catch (error) {
      logger.error('❌ Erro ao enviar mensagem de texto no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
          this.handleTimeoutOrConnectionIssue();
      }
      return false;
    }
  }

  async sendImageMessage(imageBuffer, caption, customChatId = null) {
    if (!this.isReady || !this.sock) {
      logger.warn('⚠️ Envio de imagem abortado: WhatsApp não está conectado.');
      return false;
    }
    try {
      const chatId = customChatId || await this.getChatId();
      if (!chatId) {
        logger.error('❌ Não foi possível determinar o destino para envio de imagem.');
        return false;
      }
      await promiseTimeout(
        this.sock.sendMessage(chatId, {
          image: imageBuffer,
          caption: caption || ''
        }),
        35000,
        'Timeout ao enviar imagem no WhatsApp'
      );
      return true;
    } catch (error) {
      logger.error('❌ Erro ao enviar imagem no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
        this.handleTimeoutOrConnectionIssue();
      }
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
              await promiseTimeout(
                  this.sock.sendMessage(chatId, {
                      image: imageBuffer,
                      caption: item.formatted_message
                  }),
                  35000,
                  'Timeout ao enviar imagem no WhatsApp'
              );
              return true;
          } catch (sendImgErr) {
              logger.warn(`⚠️ Falha ao enviar mensagem com imagem (${sendImgErr.message}). Prosseguindo com fallback de texto.`);
              if (sendImgErr.message?.includes('Timeout')) {
                  this.handleTimeoutOrConnectionIssue();
                  return false;
              }
          }
      }

      // Envia somente texto como fallback
      try {
          await promiseTimeout(
              this.sock.sendMessage(chatId, {
                  text: item.formatted_message
              }),
              25000,
              'Timeout ao enviar mensagem de texto no WhatsApp'
          );
          return true;
      } catch (textErr) {
          logger.error('❌ Falha total ao enviar mensagem:', textErr.message);
          if (
              textErr.message?.includes('Connection Closed') || 
              textErr.message?.includes('not open') || 
              textErr.message?.includes('Timeout')
          ) {
              this.handleTimeoutOrConnectionIssue();
          }
          return false;
      }
    } catch (error) {
      logger.error('❌ Erro ao publicar mensagem no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
          this.handleTimeoutOrConnectionIssue();
      }
      return false;
    }
  }
}

module.exports = new WhatsappPublisher();
