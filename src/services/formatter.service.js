const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');
// couponService removed
let meliUiService;
if (env.useMlAffiliateUi) {
  try { meliUiService = require('./meliUi.service'); } catch (e) { logger.debug('meliUi.service not available:', e.message); }
}

class FormatterService {
  /**
   * Fallback: encurta qualquer URL usando serviço gratuito (is.gd)
   */
  async shortenUrl(longUrl) {
    // Tentativa 1: TinyURL (mais confiável)
    try {
      const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, { timeout: 8000 });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        logger.info(`✅ URL encurtada via TinyURL: ${res.data}`);
        return res.data.trim();
      }
    } catch (e) {
      logger.debug(`TinyURL shortener failed: ${e.message}`);
    }
    // Tentativa 2: is.gd
    try {
      const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, { timeout: 8000 });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        logger.info(`✅ URL encurtada via is.gd: ${res.data}`);
        return res.data.trim();
      }
    } catch (e) {
      logger.debug(`is.gd shortener failed: ${e.message}`);
    }
    // Tentativa 3: v.gd
    try {
      const res = await axios.get(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, { timeout: 8000 });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        logger.info(`✅ URL encurtada via v.gd: ${res.data}`);
        return res.data.trim();
      }
    } catch (e) {
      logger.debug(`v.gd shortener failed: ${e.message}`);
    }
    return null;
  }

  async formatLinkViaDirectApi(baseLink, tag) {
    const fs = require('fs');
    const path = require('path');
    const cheerio = require('cheerio');
    
    let cookieHeader = null;
    const cookiesPath = env.mlCookiesPath || path.resolve(process.cwd(), '.ml_cookies.json');
    if (fs.existsSync(cookiesPath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } catch (e) {
        logger.warn('Failed to parse .ml_cookies.json');
      }
    }

    if (!cookieHeader) {
      cookieHeader = env.mlCookieString;
    }

    if (!cookieHeader) {
      logger.debug('No cookies found for direct affiliate API.');
      return null;
    }

    // Sanitiza o cookie removendo caracteres inválidos para headers HTTP
    // Node.js rejeita caracteres fora do range ASCII imprimível (0x20-0x7E)
    cookieHeader = cookieHeader.replace(/[^\x20-\x7E]/g, '').trim();

    try {

      // 0. Tenta extrair CSRF direto do cookie string (evita GET extra)
      let csrfFromCookie = null;
      const csrfCookieMatch = cookieHeader.match(/_csrf=([^;\s]+)/);
      if (csrfCookieMatch) {
        csrfFromCookie = csrfCookieMatch[1];
        logger.info(`CSRF extraído do cookie: ${csrfFromCookie.substring(0, 10)}...`);
      }

      // 1. Get CSRF token by doing a GET to the affiliate portal
      logger.info('Fetching CSRF token from affiliate program page...');
      const portalRes = await axios.get('https://www.mercadolivre.com.br/l/afiliados-home', {
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
      
      const payload = { urls: [baseLink], tag };
      const headers = {
        'Cookie': currentCookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.mercadolivre.com.br',
        'Referer': 'https://www.mercadolivre.com.br/l/afiliados-home'
      };

      // Usa CSRF encontrado no HTML, ou fallback para o do cookie
      const finalCsrf = csrfToken || csrfFromCookie;
      if (finalCsrf) {
        headers['x-csrf-token'] = finalCsrf;
      }

      logger.info(`Sending POST to affiliate API createLink with new array payload...`);
      const apiRes = await axios.post(apiUrl, payload, { headers, timeout: 8000 });
      
      // Extract link
      if (apiRes.data) {
        // Tenta buscar no novo formato urls[0].short_url ou via regex na resposta completa
        if (apiRes.data.urls && apiRes.data.urls[0]) {
          const itemRes = apiRes.data.urls[0];
          if (itemRes.short_url) {
            logger.info(`✅ Direct API success! Generated shortlink: ${itemRes.short_url}`);
            return itemRes.short_url;
          }
        }
        
        const dataStr = JSON.stringify(apiRes.data);
        const match = dataStr.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
        if (match) {
          logger.info(`✅ Direct API success! Generated shortlink via Regex: ${match[0]}`);
          return match[0];
        }
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
    if (!link) return '';

    const tag = env.mlAffiliateTag || 'bv20260330080614';
    // Limpa o link de parâmetros originais
    const baseLink = link.split('?')[0].split('#')[0];

    // 1) Tentar obter via API direta com os cookies do Puppeteer (super rápido e autônomo)
    if (process.env.NODE_ENV !== 'test') {
      const directShortLink = await this.formatLinkViaDirectApi(baseLink, tag);
      if (directShortLink) return directShortLink;
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

    // Fallback: anexa parâmetro compatível (matt_tool)
    const longAffiliateLink = `${baseLink}?matt_tool=${tag}`;
    
    // Tenta encurtar o link longo usando serviço genérico para não enviar URL gigante
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('⚠️ Nenhum método meli.la funcionou. Tentando encurtador genérico...');
      const shortened = await this.shortenUrl(longAffiliateLink);
      if (shortened) {
        logger.info(`✅ Link encurtado via serviço genérico: ${shortened}`);
        return shortened;
      }
    }
    
    logger.warn('⚠️ FALLBACK FINAL: Retornando link longo sem encurtamento.');
    return longAffiliateLink;
  }

  async generateRawMessage(product, finalLink = null) {
    const link = finalLink || await this.formatLink(product.link);
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  async generateFormattedMessage(product, finalLink = null) {
    const link = finalLink || await this.formatLink(product.link);
    const currentPrice = product.price;

    // Formata preços no padrão brasileiro
    const formatPrice = (value) => {
      if (value === null || value === undefined) return '';
      return value.toFixed(2).replace('.', ',');
    };

    const lines = [];
    lines.push(`MERCADO LIVRE ARRASA 💛`);
    lines.push(``);
    lines.push(`🛍️ ${product.title}`);
    lines.push(``);

    const oldPrice = product.oldPrice !== undefined ? product.oldPrice : product.old_price;
    if (oldPrice && oldPrice > currentPrice) {
      lines.push(`De R$ ${formatPrice(oldPrice)}`);
    }

    lines.push(`💵 Por R$ ${formatPrice(currentPrice)}`);

    let discountPercent = product.discountPercent !== undefined ? product.discountPercent : product.discount_percent;
    if (!discountPercent && oldPrice && oldPrice > currentPrice) {
      discountPercent = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
    }

    if (discountPercent && discountPercent > 0) {
      lines.push(`😱 ${discountPercent}% OFF`);
    }

    // Adiciona cupom disponível (antes do link)
    if (product.coupon) {
      let cleanCoupon = product.coupon.trim();
      if (cleanCoupon.toLowerCase().startsWith('cupom ')) {
        cleanCoupon = cleanCoupon.substring(6).trim();
      }
      if (cleanCoupon) {
        lines.push(`🏷️ Use o cupom: ${cleanCoupon}`);
      }
    }

    lines.push(``);
    lines.push(`🛒 Compre aqui:`);
    lines.push(link);

    return lines.join('\n');
  }
}

module.exports = new FormatterService();

