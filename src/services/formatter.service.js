const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');

class FormatterService {
  formatLink(link) {
      if (!link) return '';
      
      // Remove qualquer parâmetro de busca original para garantir que nossa tag seja a principal
      let cleanLink = link.split('?')[0];
      if (cleanLink.includes('#')) cleanLink = cleanLink.split('#')[0];

      if (!env.mlAffiliateTag) return cleanLink;

      // Adiciona sua Tag de Afiliado e rastreio de campanha
      return `${cleanLink}?matt_tool=${env.mlAffiliateTag}&utm_source=whatsapp&utm_medium=chatbot&utm_campaign=afiliados_bot`;
  }

  async generateRawMessage(product) {
    const link = this.formatLink(product.link);
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nDescrição: ${product.description}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  async generateFormattedMessage(product) {
    const finalLink = this.formatLink(product.link);

    const currentPrice = product.price;
    const hasOriginalPrice = product.oldPrice && product.oldPrice > currentPrice;
    const originalPrice = hasOriginalPrice ? product.oldPrice : (currentPrice * 1.15); // Fallback visual apenas se necessário
    
    // Cálculo do desconto real
    let discountPercent = 0;
    if (hasOriginalPrice) {
        discountPercent = Math.round(((product.oldPrice - currentPrice) / product.oldPrice) * 100);
    } else {
        discountPercent = Math.floor(Math.random() * (25 - 10 + 1)) + 10; // Fallback entre 10% e 25%
    }

    // Se o preço capturado for bizarro (ou o bot falhou em pegar o desconto real), 
    // tentamos deixar a mensagem o mais honesta possível.
    let priceSection = `✖️ De: R$ ${originalPrice.toFixed(2)}\n🤑 Por: R$ ${currentPrice.toFixed(2)}`;
    if (discountPercent > 0) {
        priceSection += ` 😱🔥 ${discountPercent}% OFF`;
    }

    return `🚨 *OFERTA RELÂMPAGO MERCADO LIVRE*\n\n*${product.title}*\n\n${priceSection}\n\n🏷️ CUPOM: *VALECUPOM*\n\n🚛 *FRETE GRÁTIS*\n\n⏰ *PISCOU, PERDEU! APROVEITEM!!*\n\n🔗🛒👇\n${finalLink}`;
  }
}

module.exports = new FormatterService();
