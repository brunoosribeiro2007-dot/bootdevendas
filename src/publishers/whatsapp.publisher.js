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
      authTimeoutMs: 120000, // Aumentado para 120 segundos (Render-friendly)
      qrMaxRetries: 15,     // Dá bastante chances para carregar
      puppeteer: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
          headless: true,
          // Simular um navegador real para evitar bloqueios do WhatsApp Web
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          // 🚨 CONFIGURAÇÕES EXTREMAS DE MEMÓRIA (Última tentativa para 512MB)
          args: [
              '--no-sandbox', 
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--single-process',
              '--disable-gpu',
              '--hide-scrollbars',
              '--mute-audio',
              '--disable-breakpad',
              '--disable-canvas-aa',
              '--disable-2d-canvas-clip-aa',
              '--js-flags="--max-old-space-size=200"', // Força o Chrome a usar menos JS
              '--disk-cache-size=1' // Desativa cache de disco
          ]
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
    this.client.initialize().catch(err => {
        logger.error(`Falha crítica ao inicializar o WhatsApp Web (Chromium/Puppeteer): ${err.message}`, { stack: err.stack });
    });
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
             logger.info(`Buscando grupo: ${targetGroup}`);
             const chats = await this.client.getChats();
             const group = chats.find(c => c.isGroup && c.name.toLowerCase() === targetGroup.toLowerCase());
             if (group) {
                 chatId = group.id._serialized;
                 logger.info(`✅ Grupo encontrado! ID: ${chatId}`);
             } else {
                 logger.warn(`⚠️ Grupo '${targetGroup}' NÃO encontrado na sua lista de chats recentes! Verifique se digitou o nome EXATO.`);
             }
         } catch(e) {
             logger.error("Erro ao tentar ler histórico de grupos: ", e);
         }
      }

      if (!chatId) {
          if (!targetNumber) {
            logger.error('ATENÇÃO: Você não configurou nem Grupo nem Número de WhatsApp para envio.');
            return false;
          }
          let formattedNumber = String(targetNumber);
          if (!formattedNumber.startsWith('55')) formattedNumber = '55' + formattedNumber;
          chatId = formattedNumber.includes('@c.us') ? formattedNumber : `${formattedNumber}@c.us`; 
          logger.info(`Usando número pessoal como destino: ${chatId}`);
      }

      logger.info(`Enviando mensagem sobre ${item.product_id} para o destino -> ${chatId}`);
      
      if (item.image_url) {
         try {
             logger.info(`Tentando baixar imagem: ${item.image_url}`);
             // Limpa query params que podem quebrar o download em alguns casos
             const cleanImageUrl = item.image_url.split('?')[0];
             const media = await MessageMedia.fromUrl(cleanImageUrl, { unsafeMime: true });
             await this.client.sendMessage(chatId, media, { caption: item.formatted_message });
             logger.info('Mensagem com imagem enviada com sucesso!');
             return true;
         } catch(e) {
             logger.error(`Erro ao baixar foto (${item.image_url}). Enviando como texto apenas.`, e.message);
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
