const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');
let meliUiService;
if (env.useMlAffiliateUi) {
  try { meliUiService = require('./meliUi.service'); } catch (e) { logger.debug('meliUi.service not available:', e.message); }
}

class FormatterService {
  async formatLinkViaDirectApi(baseLink, tag) {
    const fs = require('fs');
    const path = require('path');
    const cheerio = require('cheerio');
    
    const cookiesPath = env.mlCookiesPath || path.resolve(process.cwd(), '.ml_cookies.json');
    if (!fs.existsSync(cookiesPath)) {
      logger.debug('No cookies file found for direct affiliate API.');
      return null;
    }

    try {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 1. Get CSRF token by doing a GET to the affiliate portal
      logger.info('Fetching CSRF token from affiliate program page...');
      const portalRes = await axios.get('https://www.mercadolivre.com.br/affiliate-program/', {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        },
        timeout: 8000
      });

      const html = portalRes.data;
      const $ = cheerio.load(html);
      
      // Look for CSRF token in meta tags or script elements
      let csrfToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val();
      
      if (!csrfToken) {
        // Try regex match in scripts
        const csrfMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/) || 
                          html.match(/"csrf"\s*:\s*"([^"]+)"/) || 
                          html.match(/csrf-token"\s*content="([^"]+)"/);
        if (csrfMatch) csrfToken = csrfMatch[1];
      }

      // Also check response headers for set-cookie to merge new cookies
      let currentCookieHeader = cookieHeader;
      if (portalRes.headers['set-cookie']) {
        const newCookies = portalRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        currentCookieHeader = `${cookieHeader}; ${newCookies}`;
      }

      logger.info(`CSRF Token found: ${csrfToken ? 'YES' : 'NO'}`);

      // 2. Call the POST createLink API
      const apiUrl = env.mlAffiliateApiUrl || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
      
      const payload = { url: baseLink, tag };
      const headers = {
        'Cookie': currentCookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.mercadolivre.com.br',
        'Referer': 'https://www.mercadolivre.com.br/affiliate-program/'
      };

      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }

      logger.info(`Sending POST to affiliate API createLink...`);
      const apiRes = await axios.post(apiUrl, payload, { headers, timeout: 8000 });
      
      // Extract link
      if (apiRes.data) {
        const dataStr = JSON.stringify(apiRes.data);
        const match = dataStr.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
        if (match) {
          logger.info(`✅ Direct API success! Generated shortlink: ${match[0]}`);
          return match[0];
        }
        
        if (apiRes.data.short_link) return apiRes.data.short_link;
        if (apiRes.data.shortUrl) return apiRes.data.shortUrl;
      }
    } catch (e) {
      logger.warn(`⚠️ Direct API affiliate link generation failed: ${e.message}`);
      if (e.response && e.response.data) {
        logger.warn(`API Response error details: ${JSON.stringify(e.response.data)}`);
      }
    }
    return null;
  }

  async formatLink(link) {
    if (!link) return null;

    const tag = env.mlAffiliateTag || 'bv20260330080614';
    // Limpa o link de parâmetros originais
    const baseLink = link.split('?')[0].split('#')[0];

    // 1) Tentar obter via API direta com os cookies do Puppeteer (super rápido e autônomo)
    if (process.env.NODE_ENV !== 'test') {
      const directShortLink = await this.formatLinkViaDirectApi(baseLink, tag);
      if (directShortLink && directShortLink.includes('meli.la')) return directShortLink;
    }

    // 2) Se falhar, mas UI automation estiver habilitada, tentar Puppeteer como fallback
    if (env.useMlAffiliateUi && meliUiService && process.env.NODE_ENV !== 'test') {
      try {
        const short = await meliUiService.generateShortLink(baseLink, tag, 60000);
        if (short && short.includes('meli.la')) return short;
      } catch (e) {
        logger.warn('ML UI shortlink generation failed:', e.message);
      }
    }

    // 3) Se o encurtamento oficial falhar, retornamos null (nunca usaremos links longos lógicos sem comissão)
    return null;
  }

  async generateRawMessage(product) {
    const link = await this.formatLink(product.link);
    if (!link || !link.includes('meli.la')) {
      throw new Error(`Skipping product "${product.title}": No official meli.la affiliate link generated.`);
    }
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  async generateFormattedMessage(product) {
    const finalLink = await this.formatLink(product.link);
    if (!finalLink || !finalLink.includes('meli.la')) {
      throw new Error(`Skipping product "${product.title}": No official meli.la affiliate link generated.`);
    }
    const currentPrice = product.price;
    const oldPrice = product.oldPrice || (currentPrice * 1.15);

    // Calcula desconto
    let discountPercent = product.discountPercent || 0;
    if (!discountPercent && oldPrice && currentPrice < oldPrice) {
      discountPercent = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
    }

    const headlines = [
      'OFERTA IMPERDÍVEL 🔥',
      'PROMOÇÃO RELÂMPAGO ⚡',
      'DESCONTO ESPECIAL 💰',
      'ACHADO DO DIA 🎯',
      'PREÇO BAIXOU 📉',
      'OPORTUNIDADE ÚNICA 🚀',
    ];
    const headline = headlines[Math.floor(Math.random() * headlines.length)];

    const lines = [
      `*${headline}*`,
      ``,
      `*${product.title}*`,
      `De: ~~R$ ${oldPrice.toFixed(2).replace('.', ',')}~~`,
      `*Por apenas: R$ ${currentPrice.toFixed(2).replace('.', ',')}* (${discountPercent}% OFF)`,
      ``,
      `👉 *Garanta o seu aqui:* ${finalLink}`,
    ];

    return lines.join('\n');
  }
}

module.exports = new FormatterService();


