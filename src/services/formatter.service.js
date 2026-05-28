const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');

class FormatterService {
  async formatLink(link) {
    if (!link) return '';

    const tag = env.mlAffiliateTag || 'bv20260330080614';
    // Limpa o link de parâmetros originais
    const baseLink = link.split('?')[0].split('#')[0];

    // Se configurado, tenta usar a API oficial de afiliados do Mercado Livre
    // Endpoint sugerido: https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink
    // Como a especificação pode variar, tentamos alguns formatos comuns e usamos o que retornar um URL válido.
    if (env.useMlAffiliateApi) {
      try {
        const apiUrl = env.mlAffiliateApiUrl || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';

        // 1) Tentativa POST com JSON (campo comum: "source" ou "url")
        try {
          const postBody = { source: baseLink, tag };
          const res = await axios.post(apiUrl, postBody, { timeout: 5000 });
          const body = res.data;
          if (body) {
            if (typeof body === 'string' && body.includes('http')) return body;
            if (body.link) return body.link;
            if (body.url) return body.url;
            if (body.created && body.created.url) return body.created.url;
          }
        } catch (e) {
          logger.debug(`ML Affiliate API POST falhou: ${e.message}`);
        }

        // 2) Tentativa GET com query params comuns
        try {
          const getUrl = `${apiUrl}?source=${encodeURIComponent(baseLink)}&affiliate=${encodeURIComponent(tag)}`;
          const res2 = await axios.get(getUrl, { timeout: 5000 });
          const b2 = res2.data;
          if (b2) {
            if (typeof b2 === 'string' && b2.includes('http')) return b2;
            if (b2.link) return b2.link;
            if (b2.url) return b2.url;
          }
        } catch (e) {
          logger.debug(`ML Affiliate API GET falhou: ${e.message}`);
        }
      } catch (err) {
        logger.debug(`Erro ao tentar API de afiliados: ${err.message}`);
      }
    }

    // Fallback: anexa parâmetro compatível (matt_tool) e tenta encurtar
    const finalLink = `${baseLink}?matt_tool=${tag}`;

    try {
      const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(finalLink)}`, { timeout: 4000 });
      if (res.data && typeof res.data === 'string' && res.data.includes('http')) {
        return res.data;
      }
    } catch (e) {
      logger.debug(`Falha ao encurtar link: ${e.message}`);
    }

    return finalLink;
  }

  async generateRawMessage(product) {
    const link = await this.formatLink(product.link);
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  async generateFormattedMessage(product) {
    const finalLink = await this.formatLink(product.link);
    const currentPrice = product.price;
    const oldPrice = product.oldPrice || (currentPrice * 1.15);
    


    const alerts = [
      'Item útil e barato pra casa 👇🔥',
      'Olha esse achado pra sua casa 🏠✨',
      'Dica de ouro de hoje pra economizar 💸🔥',
      'Achado do dia com preço de Black Friday 🚨',
      'Sua casa merece esse mimo (e seu bolso agradece) 😍',
      'Promoção boa de verdade, confere embaixo 👇🔥',
      'Esse aqui vale cada centavo, qualidade garantida 💯',
      'Corre que esse desconto tá surreal hoje 🏃💨',
      'Luxo acessível para o seu lar 🏠💖',
      'Não sei como ainda não esgotou nesse preço 😳🔥'
    ];
    const randomAlert = alerts[Math.floor(Math.random() * alerts.length)];

    return [
      `🖼 Imagem: ${product.imageUrl}`,
      `📦 ${product.description || 'Produto'}`,
      `📝 ${product.title}`,
      `💰 Valor: R$ ${currentPrice.toFixed(2).replace('.', ',')}`,
      ``,
      `🚨 *${randomAlert}*`,
      ``,
      `*${product.title}*`,
      ``,
      `❌ De: ~R$ ${oldPrice.toFixed(2).replace('.', ',')}~`,
      `✅ *POR: R$ ${currentPrice.toFixed(2).replace('.', ',')}*`,
      ``,

      `🔗 *Ou acesse o link:*`,
      `${finalLink}`
    ].join('\n');
  }
}

module.exports = new FormatterService();
