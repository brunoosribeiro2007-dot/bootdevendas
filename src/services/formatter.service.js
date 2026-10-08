const env = require('../config/env');
const axios = require('axios');
const logger = require('../config/logger');
const couponFetcher = require('./couponFetcher.service');
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

  async formatShopeeLinkViaApi(link) {
    const appId = env.shopeeAppId;
    const secret = env.shopeeSecret;
    if (!appId || !secret) return null;

    const query = `
      mutation generateShortLink($url: String!) {
        generateShortLink(input: { originUrl: $url }) {
          shortLink
        }
      }
    `;
    const variables = { url: link };
    const payloadStr = JSON.stringify({ query, variables });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const crypto = require('crypto');
    const baseString = appId + timestamp + payloadStr + secret;
    const signature = crypto.createHash('sha256').update(baseString).digest('hex');

    const url = 'https://open-api.affiliate.shopee.com.br/graphql';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
    };

    try {
      const res = await axios.post(url, payloadStr, { headers, timeout: 8000 });
      if (res.data && res.data.errors) {
        logger.error('Error generating Shopee short link:', JSON.stringify(res.data.errors));
        return null;
      }
      const shortLink = res.data?.data?.generateShortLink?.shortLink;
      if (shortLink) {
        logger.info(`✅ Shopee Link generated: ${shortLink}`);
        return shortLink;
      }
    } catch (e) {
      logger.warn(`Failed to generate Shopee link via API: ${e.message}`);
    }
    return null;
  }

  async formatLink(link) {
    if (!link) return '';

    const isShopee = link.includes('shopee.com.br') || link.includes('shope.ee');
    if (isShopee) {
      const apiLink = await this.formatShopeeLinkViaApi(link);
      if (apiLink) return apiLink;

      const baseLink = link.split('?')[0].split('#')[0];
      const trackingParam = env.shopeeAffiliateTag ? `?utm_campaign=-&utm_content=-&utm_medium=affiliates&utm_source=an_spp&utm_term=${env.shopeeAffiliateTag}` : '';
      const longAffLink = `${baseLink}${trackingParam}`;

      if (process.env.NODE_ENV !== 'test') {
        logger.warn('⚠️ Nenhum método oficial da Shopee funcionou. Tentando encurtador genérico...');
        const shortened = await this.shortenUrl(longAffLink);
        if (shortened) return shortened;
      }
      return longAffLink;
    }

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

  generateHeadline(productTitle) {
    if (!productTitle) return 'ACHADO IMPERDÍVEL';
    const t = productTitle.toLowerCase();
    const tNorm = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Câmera de segurança — exige câmera/filmadora + contexto de segurança
    if (/\b(filmadora|cftv)s?\b/.test(tNorm)) return 'CÂMERA DE SEGURANÇA WI-FI';
    if (/\bcameras?\b/.test(tNorm) && /\b(seguranca|vigilancia|monitoramento)\b/.test(tNorm)) {
      if (/\b(4k|dupla lente|visao noturna)\b/.test(tNorm)) return 'CÂMERA DE SEGURANÇA 4K';
      return 'CÂMERA DE SEGURANÇA WI-FI';
    }

    // Moda
    if (/\b(trico|sueter|cardigan)s?\b/.test(tNorm)) return 'TRICO PRA FICAR NO ESTILO';
    if (/\bcamisetas?\b/.test(tNorm)) return 'CAMISA PRA FICAR NO ESTILO';
    if (/\bcamisas?\b/.test(tNorm)) return 'CAMISA PRA FICAR NO ESTILO';
    if (/\b(tenis|sapato|sapatos|calcado|calcados)\b/.test(tNorm)) return 'TÊNIS CONFORTÁVEL PRA QUALQUER HORA';

    // Geladeira
    if (/\b(geladeira|refrigerador)s?\b/.test(tNorm)) {
      if (/frost free/i.test(tNorm)) return 'GELADEIRA FROST FREE ESPAÇOSA';
      return 'GELADEIRA PERFEITA PRA SUA COZINHA';
    }

    // Air fryer — antes de fritadeira genérica
    if (/\bair fryer\b/.test(tNorm)) return 'AIR FRYER PRA FACILITAR SUA VIDA';
    if (/\bfritadeiras?\b/.test(tNorm) && /sem oleo|eletrica/.test(tNorm)) return 'AIR FRYER PRA FACILITAR SUA VIDA';

    // Micro-ondas e fogão
    if (/\b(micro[- ]?ondas|microondas)\b/.test(tNorm)) return 'MICRO-ONDAS PRÁTICO E POTENTE';
    if (/\b(fogao|fogoes|cooktop|cooktops)\b/.test(tNorm)) return 'COOKTOP MODERNO PRA SUA COZINHA';

    // Liquidificador, batedeira, cafeteira
    if (/\bliquidificador(es)?\b/.test(tNorm)) return 'LIQUIDIFICADOR POTENTE E RESISTENTE';
    if (/\bbatedeiras?\b/.test(tNorm)) return 'BATEDEIRA PLANETÁRIA COMPLETA';
    if (/\bcafeteiras?\b/.test(tNorm)) return 'CAFETEIRA PRA QUEM AMA CAFÉ';

    // Purificador / filtro / bebedouro (antes de panela)
    if (/\b(purificador|purificadores|bebedouro|bebedouros)\b|\bfiltro de agua\b/.test(tNorm)) return 'PURIFICADOR DE ÁGUA PRÁTICO';

    // Panelas — do mais específico ao mais genérico
    if (/\bpanela de pressao\b/.test(tNorm)) return 'PANELA DE PRESSÃO PRÁTICA';
    if (/\bfrigideiras?\b/.test(tNorm)) return 'FRIGIDEIRA ANTIADERENTE DE QUALIDADE';
    if (/\bpanelas?\b/.test(tNorm)) return 'JOGO DE PANELAS COMPLETO';

    // TV — exige "smart" ou tamanho em polegadas para não capturar "TV" genérico
    if (/\bsmart tv\b|\btelevisao\b/.test(tNorm) || (/\btv\b/.test(tNorm) && /\d{2,3}['"]\s*(polegada|pol\b)/.test(tNorm))) {
      return 'SMART TV COM IMAGEM DE CINEMA';
    }
    if (/\b(soundbar|caixa de som)\b/.test(tNorm)) return 'SOUNDBAR COM SOM DE CINEMA';

    // Aspirador
    if (/\baspirador(es)?\b/.test(tNorm)) {
      if (/\brobos?\b/.test(tNorm)) return 'ASPIRADOR ROBÔ PRA LIMPAR TUDO';
      return 'ASPIRADOR DE PÓ POTENTE';
    }

    // Demais categorias originais
    if (/\bventilador(es)?\b/.test(tNorm)) return 'VENTILADOR POTENTE E SILENCIOSO';
    if (/\bar[- ]condicionado\b/.test(tNorm)) return 'AR-CONDICIONADO PRA REFRESCAR';
    if (/\bmaquina de lavar\b|\blava e seca\b/.test(tNorm)) return 'MÁQUINA DE LAVAR EFICIENTE';
    if (/\bferro de passar\b/.test(tNorm)) return 'FERRO DE PASSAR A VAPOR';
    if (/\b(adega|adegas|cervejeira|cervejeiras)\b/.test(tNorm)) return 'CERVEJEIRA PRA BEBIDAS GELADAS';
    if (/\bcolchao\b|\bcolchoes\b/.test(tNorm)) return 'COLCHÃO PRA DORMIR NAS NUVENS';
    if (/\b(parafusadeira|parafusadeiras|furadeira|furadeiras)\b/.test(tNorm)) return 'PARAFUSADEIRA POTENTE PRA TUDO';

    // Fallback: palavras relevantes do próprio título
    const stopWords = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para', 'pra', 'por', 'em',
      'no', 'na', 'nos', 'nas', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'que', 'sem',
      'kit', 'pro', 'max', 'bivolt', 'volts', 'unidade', 'unidades', 'modelo', 'cor', 'marca']);

    const cleanWords = productTitle
      .replace(/[^\w\sÀ-ú]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
      .slice(0, 4)
      .join(' ')
      .toUpperCase();

    return cleanWords || 'PRODUTO EM SUPER OFERTA';
  }

  async generateFormattedMessage(product, finalLink = null) {
    const link = finalLink || await this.formatLink(product.link);
    const currentPrice = product.price;

    const isShopee = String(product.id || '').startsWith('SP-') || (link && (link.includes('shopee') || link.includes('shope.ee')));

    // Helper to validate if a string is a clean/valid coupon code
    const isValidCouponCode = (c) => {
      if (!c) return false;
      const clean = c.trim();
      if (/\s|%|R\$|off|desconto|grátis|gratis/i.test(clean)) {
        return false;
      }
      return /^[A-Z0-9_-]{3,25}$/i.test(clean);
    };

    // Formata preços no padrão brasileiro (inteiro sem centavos desnecessários)
    const formatPrice = (value) => {
      if (value === null || value === undefined) return '';
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return value.toFixed(2).replace('.', ',');
    };

    if (isShopee) {
      if (product.coupon && !isValidCouponCode(product.coupon)) {
        const extracted = couponFetcher.extractCouponCode ? couponFetcher.extractCouponCode(product.coupon) : null;
        product.coupon = extracted || '';
      }

      const formatShopeePrice = (value) => {
        if (value === null || value === undefined) return '';
        return value.toFixed(2).replace('.', ',');
      };

      const shopeeHeaders = [
        'ACHADO DO DIA SHOPEE 🧡',
        'PROMOÇÃO EXCLUSIVA SHOPEE 🔥',
        'SÓ HOJE NA SHOPEE ⚡',
        'OLHA ESSE PRECINHO NA SHOPEE! 👀',
        'DESCONTO ARRASADOR SHOPEE 💥',
        'SHOPEE ARRASA 🧡',
        'OFERTA IMPERDÍVEL SHOPEE 🔥',
        'PREÇO BAIXO DE VERDADE SHOPEE 💸',
        'CORRE QUE VAI ACABAR! 🏃‍♂️💨',
        'ACHADO IMPERDÍVEL SHOPEE 💎'
      ];
      const headline = shopeeHeaders[Math.floor(Math.random() * shopeeHeaders.length)];

      const lines = [];
      lines.push(headline);
      lines.push('');
      lines.push(`🛍️ ${product.title}`);
      lines.push('');

      const oldPrice = product.oldPrice !== undefined ? product.oldPrice : product.old_price;
      if (oldPrice && oldPrice > currentPrice) {
        lines.push(`De ~R$ ${formatShopeePrice(oldPrice)}~`);
      }

      lines.push(`💵 Por R$ ${formatShopeePrice(currentPrice)}`);

      let discountPercent = product.discountPercent !== undefined ? product.discountPercent : product.discount_percent;
      if (!discountPercent && oldPrice && oldPrice > currentPrice) {
        discountPercent = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
      }

      if (discountPercent && discountPercent > 0) {
        lines.push(`😱 ${discountPercent}% OFF`);
      }

      if (product.coupon) {
        let cleanCoupon = product.coupon.trim();
        if (cleanCoupon.toLowerCase().startsWith('cupom ')) {
          cleanCoupon = cleanCoupon.substring(6).trim();
        }
        if (cleanCoupon) {
          lines.push(`🎟️ Use o Cupom: *${cleanCoupon.toUpperCase()}*`);
        }
      }

      lines.push('');
      lines.push('🛒 Compre aqui:');
      lines.push(link);

      return lines.join('\n');
    }

    // 🏷️ MERCADO LIVRE: Título em destaque no topo, título original, preço, cupom em negrito, link na mesma linha
    let resolvedCoupon = null;
    try {
      resolvedCoupon = await couponFetcher.resolveCouponForProduct(product);
    } catch (e) {
      logger.debug('[Formatter] Erro ao resolver cupom para produto:', e.message);
    }

    if (!resolvedCoupon && product.coupon) {
      resolvedCoupon = couponFetcher.extractCouponCode ? couponFetcher.extractCouponCode(product.coupon) : (isValidCouponCode(product.coupon) ? product.coupon.trim().toUpperCase() : null);
    }

    product.coupon = resolvedCoupon || '';

    const headline = this.generateHeadline(product.title);

    const lines = [];
    // 1. Título / Chamada em destaque no topo (sem negrito)
    lines.push(headline);
    lines.push('');
    // 2. Título original do produto sem alterações (sem negrito)
    lines.push(product.title.trim());
    lines.push('');
    // 3. Preço (sem negrito)
    lines.push(`💸 Por: R$ ${formatPrice(currentPrice)}`);

    // 4. Cupom em negrito!
    if (product.coupon) {
      let cleanCoupon = product.coupon.trim();
      if (cleanCoupon.toLowerCase().startsWith('cupom ')) {
        cleanCoupon = cleanCoupon.substring(6).trim();
      }
      if (cleanCoupon) {
        lines.push(`🎟️ Use o Cupom: *${cleanCoupon.toUpperCase()}*`);
      }
    }

    lines.push('');
    // 5. Link de compra (sem negrito)
    lines.push(`🛒 Compre aqui: ${link}`);

    return lines.join('\n');
  }
}

module.exports = new FormatterService();

