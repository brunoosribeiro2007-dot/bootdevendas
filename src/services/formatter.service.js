const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');

class FormatterService {
  formatLink(link) {
      if (!env.mlAffiliateTag) return link;
      const separator = link.includes('?') ? '&' : '?';
      return `${link}${separator}is_affiliate=true&tag=${env.mlAffiliateTag}`;
  }

  async generateRawMessage(product) {
    const link = this.formatLink(product.link);
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nDescrição: ${product.description}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  async generateFormattedMessage(product) {
    const mlLink = this.formatLink(product.link);
    let finalLink = mlLink;

    try {
        const response = await axios.get(`https://is.gd/create.php?format=json&url=${encodeURIComponent(mlLink)}`);
        if (response.data && response.data.shorturl) {
            finalLink = response.data.shorturl;
        }
    } catch(err) {
        logger.warn('Falha ao encurtar o link com is.gd. Mantendo link do ML.', err.message);
    }

    const oldPrice = (product.price * 1.4).toFixed(2); // Simula preço original para layout
    const discount = "40%"; // Simula desconto para layout

    return `🚨 *OFERTA RELÂMPAGO MERCADO LIVRE*\n\n*${product.title}*\n\n✖️ De: R$ ${oldPrice}\n🤑 Por: R$ ${product.price.toFixed(2)} 😱🔥 ${discount} OFF\n\n🏷️ CUPOM: *VALECUPOM*\n\n🚛 *FRETE GRÁTIS*\n\n⏰ *PISCOU, PERDEU! APROVEITEM!!*\n\n🔗🛒👇\n${finalLink}`;
  }
}

module.exports = new FormatterService();
