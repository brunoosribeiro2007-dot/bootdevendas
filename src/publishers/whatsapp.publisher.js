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
          
          for (const file of files) {
              const filePath = path.join(this.authPath, file.id);
              fs.writeFileSync(filePath, file.data);
          }
          this.addLog('✅ Login recuperado com sucesso do banco externo!');
          return true;
      } catch (e) {
          this.addLog('❌ Falha ao carregar sessão do banco.');
          return false;
      }
  }

  // 📤 SALVAR SESSÃO DO DISCO PARA O NEON (Sync total)
  async syncSessionToNeon() {
      const { saveSessionFile } = require('../database/init');
      try {
          if (!fs.existsSync(this.authPath)) return;
          const files = fs.readdirSync(this.authPath);
          this.addLog(`📤 Sincronizando ${files.length} arquivos de sessão para o Neon...`);
          
          for (const file of files) {
              const filePath = path.join(this.authPath, file);
              if (fs.lstatSync(filePath).isFile()) {
                  const data = fs.readFileSync(filePath, 'utf-8');
                  await saveSessionFile(file, data);
              }
          }
      } catch (e) {
          logger.warn(`Erro na sincronização total para o Neon:`, e.message);
      }
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 20) this.logs.pop(); // Aumentado para 20
    logger.info(msg);
  }

  async initialize() {
    // Evita múltiplas instâncias rodando juntas (Causa erro 405)
    if (this.sock) {
        try { this.sock.ev.removeAllListeners(); } catch(e) {}
        this.sock = null;
    }

    // TENTA RESTAURAR ANTES DE LIGAR O MOTOR
    await this.restoreSessionFromNeon();

    this.addLog('⚙️ Iniciando motor (Conexão Persistente)...');
    try {
        const baileys = await import('@whiskeysockets/baileys');
        const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;
        const { Boom } = await import('@hapi/boom');

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
          version,
          auth: state,
          logger: pino({ level: 'silent' }),
          browser: ['MercadoLivreBot', 'Chrome', '1.0.0'],
          printQRInTerminal: true
        });

        // SALVA NO BANCO SEMPRE QUE O LOGIN MUDA
        this.sock.ev.on('creds.update', async () => {
            await saveCreds();
            await this.syncSessionToNeon(); // Sincroniza tudo
        });

        this.sock.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr) {
            this.latestQr = qr;
            this.initStatus = 'QR Code Pronto!';
            this.addLog('📱 QR Code gerado.');
          }

          if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output?.statusCode : 0;
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            this.isReady = false;
            this.initStatus = 'Reconectando...';
            this.addLog(`❌ Conexão fechada (Motivo: ${statusCode}). Reconectando: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(() => this.initialize(), 15000);
            } else {
                this.initStatus = 'Desconectado (Scan Necessário)';
            }
          } else if (connection === 'open') {
            this.initStatus = '✅ Conectado!';
            this.isReady = true;
            this.latestQr = null;
            this.addLog('✅ Conexão realizada com sucesso!');
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

  async publish(item) {
    if (!this.isReady || !this.sock) {
        logger.warn(`Publicação abortada: WhatsApp não está pronto (Ready: ${this.isReady})`);
        return false;
    }
    
    try {
      const targetNumber = env.whatsappTargetNumber;
      const targetGroup = env.whatsappTargetGroup;
      let chatId = null;

      if (targetGroup) {
          try {
              const groups = await this.sock.groupFetchAllParticipating();
              const group = Object.values(groups).find(g => g.subject.toLowerCase() === targetGroup.toLowerCase());
              if (group) {
                  chatId = group.id;
                  logger.debug(`Grupo encontrado: ${targetGroup} (${chatId})`);
              } else {
                  logger.warn(`Grupo "${targetGroup}" não encontrado.`);
              }
          } catch (gErr) {
              logger.error('Erro ao buscar grupos:', gErr.message);
          }
      }

      if (!chatId && targetNumber) {
          chatId = `${String(targetNumber).replace(/\D/g, '')}@s.whatsapp.net`;
      }

      if (!chatId) {
          logger.error('Não foi possível determinar o destino (Grupo ou Número).');
          return false;
      }

      this.addLog(`📤 Publicando produto: ${item.title.substring(0, 30)}...`);
      
      await this.sock.sendMessage(chatId, {
          image: { url: item.image_url },
          caption: item.formatted_message
      });
      
      return true;
    } catch (error) {
      logger.error('Erro ao publicar mensagem no WhatsApp:', error);
      return false;
    }
  }
}

}

module.exports = new WhatsappPublisher();
