const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');
let meliUiService;
if (env.useMlAffiliateUi) {
  try { meliUiService = require('./meliUi.service'); } catch (e) { logger.debug('meliUi.service not available:', e.message); }
}

class FormatterService {
  async formatLink(link) {
    if (!link) return '';

    const tag = env.mlAffiliateTag || 'bv20260330080614';
    // Limpa o link de parâmetros originais
    const baseLink = link.split('?')[0].split('#')[0];

    // Se configurado, tenta usar a API oficial de afiliados do Mercado Livre
    // Endpoint sugerido: https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink
    // Tentamos vários formatos de requisição e parâmetros comuns que APIs de afiliados costumam aceitar.
    // IMPORTANTE: evitar chamadas externas durante testes (NODE_ENV === 'test').
    // 1) Se UI automation estiver habilitada, tentar gerar meli.la via Puppeteer wrapper
    if (env.useMlAffiliateUi && meliUiService && process.env.NODE_ENV !== 'test') {
      try {
        const short = await meliUiService.generateShortLink(baseLink, tag, 60000);
        if (short && short.includes('meli.la')) return short;
      } catch (e) {
        logger.warn('ML UI shortlink generation failed:', e.message);
      }
    }

    if (env.useMlAffiliateApi && process.env.NODE_ENV !== 'test') {
      const apiUrl = env.mlAffiliateApiUrl || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
      // Only accept short official affiliate links (prefer `meli.la`).
      const isAllowed = (url) => {
        if (!url || typeof url !== 'string') return false;
        const u = url.toLowerCase();
        // Prefer meli.la short links. If not present, we won't accept generic mlstatic asset links.
        return u.includes('meli.la');
      };

      const tryExtract = (data) => {
        if (!data) return null;
        if (typeof data === 'string') {
          const m = data.match(/https?:\/\/[^\s'"<>]+/);
          if (m && isAllowed(m[0])) return m[0];
          return null;
        }
        const keys = ['short_link','shortUrl','short','link','url','tracking_url','trackingLink','result','created','data'];
        for (const k of keys) {
          if (data[k]) {
            if (typeof data[k] === 'string' && data[k].includes('http')) return data[k];
            if (typeof data[k] === 'object') {
              const nested = tryExtract(data[k]);
              if (nested) return nested;
            }
          }
        }
        // search any string values inside object
        const stack = [data];
        while (stack.length) {
          const obj = stack.pop();
          if (typeof obj === 'string' && obj.includes('http')) {
            const m = obj.match(/https?:\/\/[^\s'"<>]+/);
            if (m && isAllowed(m[0])) return m[0];
          }
          if (typeof obj === 'object') {
            for (const v of Object.values(obj)) stack.push(v);
          }
        }
        return null;
      };

      const postVariants = [
        { source: baseLink, tag },
        { url: baseLink, tag },
        { resource: baseLink, tag },
        { link: baseLink, affiliate: tag },
        { url: baseLink, affiliate: tag, tag },
      ];

      for (const body of postVariants) {
        try {
          const res = await axios.post(apiUrl, body, { timeout: 5000 });
          const found = tryExtract(res.data);
          if (found) return found;
        } catch (e) {
          logger.debug(`ML Affiliate API POST variant failed: ${e.message}`);
        }
      }

      const getVariants = [
        `?source=${encodeURIComponent(baseLink)}&affiliate=${encodeURIComponent(tag)}`,
        `?url=${encodeURIComponent(baseLink)}&tag=${encodeURIComponent(tag)}`,
        `?link=${encodeURIComponent(baseLink)}&affiliate=${encodeURIComponent(tag)}`,
      ];

      for (const q of getVariants) {
        try {
          const res2 = await axios.get(apiUrl + q, { timeout: 5000 });
          const found2 = tryExtract(res2.data);
          if (found2) return found2;
        } catch (e) {
          logger.debug(`ML Affiliate API GET variant failed: ${e.message}`);
        }
      }
    }

    // Fallback: anexa parâmetro compatível (matt_tool) e retorna o link direto sem encurtamento
    const finalLink = `${baseLink}?matt_tool=${tag}`;
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
      `🚨 *${randomAlert}*`,
      ``,
      `*${product.title}*`,
      ``,
      `❌ De: ~R$ ${oldPrice.toFixed(2).replace('.', ',')}~`,
      `✅ *POR: R$ ${currentPrice.toFixed(2).replace('.', ',')}*`,
      ``,
      `🔍 Cole este texto no buscador do Mercado Livre: ${product.id}`,
      ``,
      `🔗 Ou acesse o link:`,
      `${finalLink}`
    ].join('\n');
  }
}

module.exports = new FormatterService();
