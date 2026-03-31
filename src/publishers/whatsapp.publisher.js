const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const BasePublisher = require('./base.publisher');
const logger = require('../config/logger');

class WhatsappPublisher extends BasePublisher {
  constructor() {
    super();
    logger.info('Inicializando cliente do WhatsApp Web Automático...');
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
          args: [
              '--no-sandbox', 
              '--disable-setuid-sandbox', 
              '--disable-dev-shm-usage', 
              '--disable-accelerated-2d-canvas', 
              '--no-first-run', 
              '--disable-gpu',
              '--no-zygote'
          ],
          authTimeoutMs: 60000
      }
    });

    this.isReady = false;
    this.latestQr = null;

    this.client.on('qr', (qr) => {
        logger.info('🚀 ALERTA: NOVO QR CODE DO WHATSAPP GERADO! Escaneie pelo seu celular:');
        qrcode.generate(qr, { small: true });
        this.latestQr = qr;
    });

    this.client.on('ready', () => {
        logger.info('✅ WhatsApp conectado com sucesso! Pronto para postar!');
        this.isReady = true;
        this.latestQr = null;
    });

    this.client.on('auth_failure', () => {
        logger.error('❌ Falha na autenticação do WhatsApp.');
    });

    // Iniciar o cliente do wpp localmente no momento que este arquivo for chamado
    this.client.initialize();
  }

  async publish(item) {
    if (!this.isReady) {
      logger.warn('WhatsApp ainda não está pronto para enviar, aguardando conexão (Tente escanear o QR Code!). Job tentará depois.');
      return false; 
    }

    try {
      const targetNumber = process.env.WHATSAPP_TARGET_NUMBER;
      const targetGroup = process.env.WHATSAPP_TARGET_GROUP;
      
      let chatId = null;

      if (targetGroup) {
         try {
             // getChats() pega o histórico do Wpp (onde o grupo deve estar)
             const chats = await this.client.getChats();
             const group = chats.find(c => c.isGroup && c.name.toLowerCase() === targetGroup.toLowerCase());
             if (group) {
                 chatId = group.id._serialized;
             } else {
                 logger.warn(`Grupo '${targetGroup}' não encontrado na lista de conversas. Veja se você tem mensagens lá. Vamos tentar usar o número pessoal como plano B.`);
             }
         } catch(e) {
             logger.error("Erro ao tentar ler histórico de grupos: ", e);
         }
      }

      if (!chatId) {
          if (!targetNumber) {
            logger.error('ATENÇÃO: Você não configurou a variável WHATSAPP_TARGET_NUMBER no seu arquivo .env.');
            return false;
          }
          let formattedNumber = String(targetNumber);
          if (!formattedNumber.startsWith('55')) formattedNumber = '55' + formattedNumber;
          chatId = formattedNumber.includes('@c.us') ? formattedNumber : `${formattedNumber}@c.us`; 
      }

      logger.info(`Enviando mensagem sobre ${item.product_id} para o destino -> ${chatId}`);
      
      if (item.image_url) {
         try {
             const media = await MessageMedia.fromUrl(item.image_url);
             await this.client.sendMessage(chatId, media, { caption: item.formatted_message });
             return true;
         } catch(e) {
             logger.error('Erro ao baixar foto. Enviando como texto apenas.', e);
             await this.client.sendMessage(chatId, item.formatted_message);
             return true;
         }
      } else {
         await this.client.sendMessage(chatId, item.formatted_message);
         return true;
      }
    } catch (error) {
      logger.error('Erro crítico ao publicar no WhatsApp:', error);
      return false; // Retorna false para que o banco saiba que não foi publicado
    }
  }
}

module.exports = new WhatsappPublisher();
