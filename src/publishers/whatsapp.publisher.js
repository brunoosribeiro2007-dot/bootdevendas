const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const env = require('../config/env');
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');

class WhatsappPublisher {
  constructor() {
    this.sock = null;
    this.latestQr = null;
    this.isReady = false;
    this.authPath = path.resolve(process.cwd(), '.baileys_auth');
    
    // Garantir que a pasta de auth existe e está limpa para o novo motor
    if (!fs.existsSync(this.authPath)) {
        fs.mkdirSync(this.authPath, { recursive: true });
    }

    this.initialize().catch(err => {
        logger.error('Falha fatal na inicialização do Baileys:', err);
    });
  }

  async initialize() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();

    logger.info(`Iniciando Motor Leve (Baileys v${version.join('.')})...`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }), // Deixa o console limpo, usaremos nosso logger
      browser: ['Antigravity Bot', 'Chrome', '1.0.0']
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.latestQr = qr;
        this.isReady = false;
        logger.info('📱 Novo QR Code gerado! Escaneie no seu WhatsApp.');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
            lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
        
        this.isReady = false;
        logger.warn(`Conexão fechada. Motivo: ${lastDisconnect.error?.message}. Reconectando: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          this.initialize();
        }
      } else if (connection === 'open') {
        logger.info('✅ Conexão com WhatsApp estabelecida com sucesso! Motor Leve Ativo.');
        this.isReady = true;
        this.latestQr = null;
      }
    });
  }

  async publish(item) {
    if (!this.isReady || !this.sock) {
      logger.error('Impossível publicar: Bot não está conectado.');
      return false;
    }

    try {
      const targetNumber = env.whatsappTargetNumber;
      const targetGroup = env.whatsappTargetGroup;
      let chatId = null;

      // 1. Tenta achar pelo grupo se configurado
      if (targetGroup) {
          try {
              logger.info(`Buscando grupo: ${targetGroup}`);
              const groups = await this.sock.groupFetchAllParticipating();
              const group = Object.values(groups).find(g => g.subject.toLowerCase() === targetGroup.toLowerCase());
              
              if (group) {
                  chatId = group.id;
                  logger.info(`✅ Grupo encontrado! ID: ${chatId}`);
              } else {
                  logger.warn(`⚠️ Grupo '${targetGroup}' não encontrado na lista de participações.`);
              }
          } catch (e) {
              logger.error('Erro ao buscar grupos:', e);
          }
      }

      // 2. Fallback para número pessoal
      if (!chatId) {
          if (!targetNumber) {
              logger.error('Erro: Nem grupo nem número configurados.');
              return false;
          }
          let num = String(targetNumber).replace(/\D/g, '');
          chatId = `${num}@s.whatsapp.net`;
          logger.info(`Usando número pessoal como destino: ${chatId}`);
      }

      logger.info(`Enviando oferta: ${item.product_id} para ${chatId}`);

      // 3. Enviar mensagem com imagem
      await this.sock.sendMessage(chatId, {
          image: { url: item.image_url },
          caption: item.formatted_message
      });

      logger.info(`Mensagem enviada com sucesso para ${chatId}`);
      return true;

    } catch (error) {
      logger.error('Erro ao publicar mensagem no WhatsApp (Motor Leve):', error);
      return false;
    }
  }
}

module.exports = new WhatsappPublisher();
