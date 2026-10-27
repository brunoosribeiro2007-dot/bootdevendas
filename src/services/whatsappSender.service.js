/**
 * ==============================================================================
 * WHATSAPP SENDER SERVICE - INTEGRAÇÃO E DISPARO DE PROMOÇÕES
 * ==============================================================================
 * Orquestra o fluxo completo de publicação de ofertas:
 * 1. Recepção de texto bruto ou parâmetros estruturados (URL, cupom, etc.).
 * 2. Extração e descurtamento via promoParser.
 * 3. Conversão para link oficial de afiliado meli.la via affiliateConverter.
 * 4. Aplicação de marca d'água no topo central da imagem via watermarkService.
 * 5. Geração de copy criativa (Gemini/Regras) e montagem de legenda via postFormatter.
 * 6. Disparo da imagem com legenda diretamente no WhatsApp via Baileys.
 * ==============================================================================
 */

const logger = require('../config/logger');
const promoParser = require('./promoParser.service');
const watermarkService = require('./watermark.service');
const affiliateConverter = require('./affiliateConverter.service');
const postFormatter = require('./postFormatter.service');
const whatsappPublisher = require('../publishers/whatsapp.publisher');

class WhatsappSenderService {

  /**
   * Processa uma promoção de ponta a ponta sem enviar ao WhatsApp (modo preview).
   * Ideal para testes, dashboards e validação de layout.
   * 
   * @param {Object} input - Entrada contendo rawText ou { url, title, price, imageUrl, coupon, storeName }.
   * @returns {Promise<Object>} Dados processados, legenda final e imagem com marca d'água em base64.
   */
  async previewPromotion(input = {}) {
    logger.info('[WhatsappSender] Iniciando geração de preview de promoção...');
    const resolved = await this.resolvePromotionData(input);

    // 1. Gera link de afiliado oficial
    const affiliateLink = await affiliateConverter.convertToAffiliateLink(resolved.cleanUrl);

    // 2. Formata a legenda completa
    const caption = await postFormatter.formatPost({
      title: resolved.title,
      price: resolved.price,
      coupon: resolved.coupon,
      affiliateLink: affiliateLink,
      storeName: resolved.storeName,
      customHeadline: resolved.customHeadline
    });

    // 3. Aplica marca d'água na imagem
    let watermarkedImage = null;
    if (resolved.imageUrl) {
      watermarkedImage = await watermarkService.applyWatermark(resolved.imageUrl);
    }

    return {
      success: true,
      product: {
        title: resolved.title,
        price: resolved.price,
        coupon: resolved.coupon,
        imageUrl: resolved.imageUrl,
        cleanUrl: resolved.cleanUrl
      },
      affiliateLink,
      caption,
      imageBase64: watermarkedImage ? watermarkedImage.base64 : null
    };
  }

  /**
   * Executa o fluxo completo e envia a postagem com imagem + marca d'água e legenda para o WhatsApp.
   * 
   * @param {Object} input - Entrada contendo rawText ou campos estruturados.
   * @param {string|null} [targetChatId] - Chat ID específico (opcional, usa o grupo padrão se omitido).
   * @returns {Promise<{ success: boolean, message?: string, details?: Object }>}
   */
  async sendPromotion(input = {}, targetChatId = null) {
    try {
      logger.info('🚀 [WhatsappSender] Iniciando pipeline de envio de promoção...');

      // 1. Resolve os dados da promoção (seja texto bruto ou estruturado)
      const resolved = await this.resolvePromotionData(input);

      // 2. Converte a URL canônica para o link de afiliado oficial meli.la
      const affiliateLink = await affiliateConverter.convertToAffiliateLink(resolved.cleanUrl);

      // 3. Monta a legenda oficial
      const caption = await postFormatter.formatPost({
        title: resolved.title,
        price: resolved.price,
        coupon: resolved.coupon,
        affiliateLink: affiliateLink,
        storeName: resolved.storeName,
        customHeadline: resolved.customHeadline
      });

      // 4. Aplica a marca d'água na foto do produto
      let imageBuffer = null;
      if (resolved.imageUrl) {
        const wmResult = await watermarkService.applyWatermark(resolved.imageUrl);
        imageBuffer = wmResult.buffer;
      }

      // 5. Envia para o WhatsApp via Baileys
      let sent = false;
      if (imageBuffer && imageBuffer.length > 0) {
        sent = await whatsappPublisher.sendImageMessage(imageBuffer, caption, targetChatId);
      } else {
        // Fallback de texto caso a imagem falhe totalmente
        sent = await whatsappPublisher.sendTextMessage(caption, targetChatId);
      }

      if (sent) {
        logger.info(`✅ [WhatsappSender] Promoção "${resolved.title}" publicada com sucesso no WhatsApp!`);
        return {
          success: true,
          message: 'Promoção publicada com sucesso no WhatsApp!',
          details: {
            title: resolved.title,
            price: resolved.price,
            coupon: resolved.coupon,
            affiliateLink,
            caption
          }
        };
      } else {
        logger.error('[WhatsappSender] Falha ao disparar mensagem no WhatsApp.');
        return {
          success: false,
          error: 'WhatsApp indisponível ou erro no envio da mensagem.'
        };
      }

    } catch (error) {
      logger.error(`❌ [WhatsappSender] Erro crítico no envio da promoção: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Normaliza os dados da promoção a partir de texto bruto ou campos avulsos.
   * @private
   */
  async resolvePromotionData(input) {
    // Caso tenha recebido texto bruto (ex: monitoramento de canal concorrente)
    if (input.rawText || (typeof input === 'string' && input.length > 0)) {
      const text = input.rawText || input;
      const parsed = await promoParser.parsePromotion(text);

      if (!parsed.found) {
        throw new Error(parsed.error || 'Não foi possível extrair um link válido do texto fornecido.');
      }

      return {
        title: input.title || parsed.product.title,
        price: input.price !== undefined ? input.price : parsed.product.price,
        imageUrl: input.imageUrl || parsed.product.imageUrl,
        coupon: input.coupon || parsed.coupon,
        cleanUrl: parsed.cleanUrl,
        storeName: input.storeName,
        customHeadline: input.customHeadline
      };
    }

    // Caso tenha recebido URL direta
    if (input.url) {
      const cleanUrl = await promoParser.unshortenUrl(input.url);

      // Se os dados do produto não foram preenchidos manualmente, faz o scraping
      if (!input.title || input.price === undefined || !input.imageUrl) {
        const scraped = await promoParser.scrapeProductData(cleanUrl);
        return {
          title: input.title || scraped.title,
          price: input.price !== undefined ? input.price : scraped.price,
          imageUrl: input.imageUrl || scraped.imageUrl,
          coupon: input.coupon || null,
          cleanUrl,
          storeName: input.storeName,
          customHeadline: input.customHeadline
        };
      }

      return {
        title: input.title,
        price: input.price,
        imageUrl: input.imageUrl,
        coupon: input.coupon || null,
        cleanUrl,
        storeName: input.storeName,
        customHeadline: input.customHeadline
      };
    }

    throw new Error('Entrada inválida: forneça uma "rawText" ou um objeto com "url" do Mercado Livre.');
  }
}

module.exports = new WhatsappSenderService();
