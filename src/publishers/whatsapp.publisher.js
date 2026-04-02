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
    this.initStatus = 'Iniciando...';
    this.logs = []; // Histórico para debug na web
    this.authPath = path.resolve(process.cwd(), '.baileys_auth');
    
    // Garantir que a pasta de auth existe
    if (!fs.existsSync(this.authPath)) {
        try {
            fs.mkdirSync(this.authPath, { recursive: true });
        } catch (e) {
            logger.error('Erro ao criar pasta de auth:', e);
        }
    }
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 5) this.logs.pop();
    logger.info(msg);
  }

  async initialize() {
    this.addLog('⚙️ Motor: Carregando módulos...');
    try {
        const baileys = await import('@whiskeysockets/baileys');
        const { default: makeWASocket, useMultiFileAuthState } = baileys;
        const { Boom } = await import('@hapi/boom');

        this.addLog('📂 Motor: Configurando autenticação...');
        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

        this.addLog('🚀 Motor: Conectando (Padrão Linux)...');
        this.sock = makeWASocket({
          auth: state,
          version: [2, 3000, 1015901307],
          printQRInTerminal: false,
          logger: pino({ level: 'silent' }),
          browser: ['Ubuntu', 'Chrome', '1.0.0'], // Identidade padrão
          connectTimeoutMs: 60000,
          defaultQueryTimeoutMs: 60000,
          authTimeoutMs: 60000,
          keepAliveIntervalMs: 30000,
          generateHighQualityQR: true
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr) {
            this.latestQr = qr;
            this.initStatus = 'Escaneie o QR Code abaixo';
            this.addLog('📱 QR Code gerado pelo servidor!');
          }

          if (connection === 'close') {
            const code = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output?.statusCode : 0;
            
            this.isReady = false;
            this.initStatus = `Desistência na Rede ou Desconectado (${code})`;
            this.addLog(`❌ Conexão fechada: ${code}`);
            
            // Tentativa de reconexão inteligente
            setTimeout(() => this.initialize(), 5000);
          } else if (connection === 'open') {
            this.initStatus = '✅ Conectado!';
            this.addLog('✅ Sucesso! Bot pronto e ativo.');
            this.isReady = true;
            this.latestQr = null;
          }
        });
    } catch (err) {
        logger.error('❌ Módulo WhatsApp: Erro fatal na inicialização:', err.message);
    }
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
