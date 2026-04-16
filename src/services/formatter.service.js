const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');

class FormatterService {
  formatLink(link) {
      if (!link) return '';
      
      // Extrair o ID do produto (MLB ou MLBU) para montar um link curto oficial do ML
      const mlbMatch = link.match(/(MLB[U]?\d+)/i);
      if (mlbMatch) {
          const productId = mlbMatch[1];
          const shortLink = `https://www.mercadolivre.com.br/p/${productId}`;
          if (env.mlAffiliateTag) {
              return `${shortLink}?matt_tool=${env.mlAffiliateTag}`;
          }
          return shortLink;
      }

      // Fallback: limpa e adiciona tag
      let cleanLink = link.split('?')[0];
      if (cleanLink.includes('#')) cleanLink = cleanLink.split('#')[0];
      if (!env.mlAffiliateTag) return cleanLink;
      return `${cleanLink}?matt_tool=${env.mlAffiliateTag}`;
  }

  async generateRawMessage(product) {
    const link = this.formatLink(product.link);
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nDescrição: ${product.description}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  // Títulos criativos que variam a cada postagem
  getCreativeTitle(hasDiscount) {
    if (hasDiscount) {
      const titles = [
        '🚨 *OFERTA RELÂMPAGO MERCADO LIVRE*',
        '🔥 *PROMOÇÃO IMPERDÍVEL - CORRE!*',
        '💥 *ACHADO DO DIA - MERCADO LIVRE*',
        '⚡ *PREÇO DE LIQUIDAÇÃO!*',
        '🤑 *DESCONTO ABSURDO - SÓ HOJE!*',
        '💰 *MEGA OFERTA MERCADO LIVRE*',
        '🏪 *QUEIMA DE PREÇO - MERCADO LIVRE*',
      ];
      return titles[Math.floor(Math.random() * titles.length)];
    } else {
      const titles = [
        '🏷️ *OFERTAÇO DO DIA - APROVEITE!*',
        '🎯 *OFERTA ESPECIAL PRA VOCÊ!*',
        '🛒 *CORRE QUE TÁ BARATO!*',
        '🔔 *ALERTA DE PROMOÇÃO!*',
        '💎 *ACHADO IMPERDÍVEL!*',
        '✨ *MELHOR PREÇO DO MERCADO LIVRE!*',
        '🏠 *OFERTA PRA SUA CASA!*',
      ];
      return titles[Math.floor(Math.random() * titles.length)];
    }
  }

  // Frases de urgência variadas
  getUrgencyPhrase() {
    const phrases = [
      '⏰ *PISCOU, PERDEU! APROVEITEM!!*',
      '⏳ *CORRE QUE ACABA RÁPIDO!*',
      '🏃 *VAI ACABAR! GARANTA O SEU!*',
      '⚡ *ÚLTIMAS UNIDADES NESSE PREÇO!*',
      '🔥 *NÃO PERCA ESSA CHANCE!*',
      '💨 *VOANDO DO ESTOQUE!*',
      '🚀 *PREÇO PODE SUBIR A QUALQUER MOMENTO!*',
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  async generateFormattedMessage(product) {
    const finalLink = this.formatLink(product.link);
    const currentPrice = product.price;
    const hasDiscount = product.hasDiscount || (product.oldPrice && product.oldPrice > currentPrice);
    
    let priceSection = '';

    if (hasDiscount && product.oldPrice && product.oldPrice > currentPrice) {
        // Produto com desconto REAL verificado
        const discountPercent = Math.round(((product.oldPrice - currentPrice) / product.oldPrice) * 100);
        priceSection = `✖️ De: R$ ${product.oldPrice.toFixed(2)}\n🤑 Por: R$ ${currentPrice.toFixed(2)} 😱🔥 ${discountPercent}% OFF`;
    } else {
        // Produto sem desconto explícito — mostra só o preço atual (honesto)
        priceSection = `💰 Por apenas: R$ ${currentPrice.toFixed(2)}`;
    }

    const creativeTitle = this.getCreativeTitle(hasDiscount);
    const urgencyPhrase = this.getUrgencyPhrase();

    return `${creativeTitle}\n\n*${product.title}*\n\n${priceSection}\n\n🚛 *FRETE GRÁTIS*\n\n${urgencyPhrase}\n\n🔗🛒👇\n${finalLink}`;
  }
}

module.exports = new FormatterService();
