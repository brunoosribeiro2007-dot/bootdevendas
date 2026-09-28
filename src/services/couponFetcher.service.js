const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const env = require('../config/env');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Cache em memória de cupons do dia do Mercado Livre.
 * Renovado a cada ciclo de captura (TTL de 1 hora).
 */
let couponCache = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
let inMemoryActiveCoupon = null;
let inMemoryActiveCouponDate = null; // Data (YYYY-MM-DD) em que o cupom foi armazenado em memória

const BLOCKED_COUPON_CODES = new Set([
  'TUDOPARACASA', 'ILUMINESUACASA', 'CASAESADE', 'MELHORESOFERTAS',
  'ACESSRIOSPRAVOC', 'ITENSPARASUAMOTO', 'SOPAULOAUTOPEAS', 'VERECOMPRAR2024',
  'CAMAINBOXLOJAOFICIAL', 'OOCEANDROPSA97032', 'UNIVERSALCASES2', 'BLMOTOPARTS',
  'SAOPAULOACESSORIOS', 'ANIMAFESTCAMPINAS', 'BRIMPORTSPEAS', 'SHOPFLEXCOM',
  'CASA', 'LAR', 'ELETRO', 'OFF', 'CUPOM', 'DESCONTO', 'PRODUTO', 'PRODUTOS',
  'SELECIONADOS', 'COMPRA', 'MINIMA', 'SEMCOMPRA', 'FRETE'
]);

function isValidRealCouponCode(c) {
  if (!c || typeof c !== 'string') return false;
  const clean = c.trim().toUpperCase();
  if (clean.length < 3 || clean.length > 20) return false;
  if (BLOCKED_COUPON_CODES.has(clean)) return false;
  if (/^(OFF|\d+OFF|R\$\d+|DESCONTO|CUPOM)$/i.test(clean)) return false;
  return /^[A-Z0-9_-]+$/.test(clean);
}

/**
 * Retorna a data atual no fuso de Brasília (America/Sao_Paulo) no formato YYYY-MM-DD.
 */
function getTodayDateStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/**
 * Obtém os cookies salvos para autenticação no Mercado Livre.
 */
function getAuthCookies() {
  let cookieHeader = null;
  const cookiesPath = env.mlCookiesPath || path.resolve(process.cwd(), '.ml_cookies.json');
  if (fs.existsSync(cookiesPath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
      logger.warn('[CouponFetcher] Falha ao ler .ml_cookies.json: ' + e.message);
    }
  }

  if (!cookieHeader) {
    cookieHeader = env.mlCookieString;
  }

  if (cookieHeader) {
    return cookieHeader.replace(/[^\x20-\x7E]/g, '').trim();
  }
  return null;
}

/**
 * Busca cupons do dia via API pública do Mercado Livre (MLB/promotions e search).
 */
async function fetchFromApi() {
  const found = [];
  try {
    const res = await axios.get('https://api.mercadolibre.com/sites/MLB/search?tag=best_seller&has_discount=true&limit=50&sort=relevance', {
      headers: {
        'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      httpsAgent,
      timeout: 8000
    });

    if (res.data && res.data.results) {
      for (const item of res.data.results) {
        const couponLabel = item.discount_label || (item.attributes && item.attributes.find(a => a.id === 'COUPON_CODE'));
        if (couponLabel) {
          const code = typeof couponLabel === 'string' ? couponLabel : couponLabel.value_name || couponLabel.value_id;
          if (code && !found.find(c => c.code === code)) {
            found.push({
              code: code.trim().toUpperCase(),
              title: `Cupom ${code}`,
              source: 'api_search',
              discount: null,
              minAmount: 0,
              capturedAt: new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`[CouponFetcher] API source 1 failed: ${e.message}`);
  }

  try {
    const res2 = await axios.get('https://api.mercadolibre.com/sites/MLB/promotions?type=coupon', {
      headers: {
        'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      httpsAgent,
      timeout: 8000
    });
    if (res2.data && Array.isArray(res2.data)) {
      for (const promo of res2.data) {
        const code = promo.code || promo.coupon_code || promo.id;
        const discount = promo.discount_percent ? `${promo.discount_percent}% OFF` : (promo.amount ? `R$ ${promo.amount} OFF` : null);
        if (code && !found.find(c => c.code === code)) {
          found.push({
            code: String(code).trim().toUpperCase(),
            title: promo.title || promo.name || `Cupom ${code}`,
            source: 'api_promotions',
            discount,
            minAmount: promo.min_amount || 0,
            capturedAt: new Date().toISOString()
          });
        }
      }
    }
  } catch (e) {
    logger.debug(`[CouponFetcher] API source 2 failed: ${e.message}`);
  }

  return found;
}

/**
 * Busca cupons via scraping da página oficial de cupons e ofertas do Mercado Livre.
 * Utiliza cookies salvos da conta para acessar a página completa de cupons ativos.
 */
async function fetchFromHtml() {
  const found = [];
  const cookieHeader = getAuthCookies();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9'
  };

  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }

  const urls = [
    'https://www.mercadolivre.com.br/cupons',
    'https://www.mercadolivre.com.br/ofertas#nav-header'
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers,
        httpsAgent,
        timeout: 10000
      });

      const html = res.data;
      if (!html || typeof html !== 'string') continue;
      const $ = cheerio.load(html);

      // 1. Processa cards de cupons (.coupon-card) da página /cupons do ML
      $('.coupon-card').each((_, el) => {
        const fullText = $(el).text().replace(/\s+/g, ' ').trim();
        if (!fullText) return;

        // Extrai desconto
        const discountMatch = fullText.match(/(\d+%\s*OFF|R\$\s*[\d,.]+\s*OFF)/i);
        const discount = discountMatch ? discountMatch[1].replace(/\s+/g, ' ').trim() : null;

        // Extrai compra mínima
        const minMatch = fullText.match(/Compra m[ií]nima\s*R\$\s*([\d,.]+)/i);
        let minAmount = 0;
        if (minMatch) {
          minAmount = parseFloat(minMatch[1].replace(/\./g, '').replace(',', '.'));
        }

        // Título / escopo
        let title = '';
        const titleEl = $(el).find('span, p, h2, h3').first();
        if (titleEl.length > 0) {
          title = titleEl.text().replace(/\s+/g, ' ').trim();
        }
        if (!title && discount) {
          title = fullText.substring(0, 40);
        }

        // Código explícito: apenas se houver tag específica de código ou "código: XYZ"
        let code = '';
        const explicitCodeEl = $(el).find('.coupon-card__code, [class*="coupon-code"], [class*="coupon__code"]');
        if (explicitCodeEl.length > 0) {
          code = explicitCodeEl.text().trim().replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
        } else {
          const matchCode = fullText.match(/(?:c[oó]digo|cupom):\s*([A-Za-z0-9_-]{3,20})/i);
          if (matchCode) {
            code = matchCode[1].toUpperCase();
          }
        }

        if (code && isValidRealCouponCode(code) && !found.find(c => c.code === code)) {
          found.push({
            code,
            title,
            discount,
            minAmount,
            source: 'ml_cupons_page',
            capturedAt: new Date().toISOString()
          });
        }
      });

      // 2. Extrai códigos explícitos em tags e pills
      const pillSelectors = [
        '.coupon-card__code',
        '[class*="coupon-code"]',
        '[class*="coupon__code"]',
        '.poly-coupons__pill',
        '[class*="coupons__pill"]',
        '[class*="coupon-pill"]',
        '[data-testid*="coupon"]',
        '.ui-pdp-promotions-pill__text'
      ];

      for (const sel of pillSelectors) {
        $(sel).each((_, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          const codeMatch = text.match(/\b([A-Z0-9_-]{4,15})\b/g);
          if (codeMatch) {
            for (const code of codeMatch) {
              const cleanCode = code.trim().toUpperCase();
              if (isValidRealCouponCode(cleanCode) && !found.find(c => c.code === cleanCode)) {
                found.push({
                  code: cleanCode,
                  title: text,
                  discount: null,
                  minAmount: 0,
                  source: 'html_pill',
                  capturedAt: new Date().toISOString()
                });
              }
            }
          }
        });
      }

    } catch (e) {
      logger.debug(`[CouponFetcher] Scraping falhou para ${url}: ${e.message}`);
    }
  }

  return found;
}

/**
 * Busca cupons do dia combinando API e scraping autenticado do Mercado Livre.
 * Usa cache de 1 hora para evitar requisições repetidas.
 */
async function fetchDailyCoupons(forceRefresh = false) {
  const now = Date.now();
  const cacheAge = now - cacheTimestamp;

  if (!forceRefresh && couponCache.length > 0 && cacheAge < CACHE_TTL_MS) {
    logger.debug(`[CouponFetcher] Retornando ${couponCache.length} cupons do cache (idade: ${Math.round(cacheAge / 60000)} min).`);
    return couponCache;
  }

  logger.info('[CouponFetcher] 🔄 Buscando cupons do dia no Mercado Livre...');

  const [apiCoupons, htmlCoupons] = await Promise.allSettled([
    fetchFromApi(),
    fetchFromHtml()
  ]);

  const all = [];
  if (apiCoupons.status === 'fulfilled') all.push(...(apiCoupons.value || []));
  if (htmlCoupons.status === 'fulfilled') all.push(...(htmlCoupons.value || []));

  // Deduplicar por código
  const unique = [];
  const seen = new Set();
  for (const c of all) {
    if (c.code && !seen.has(c.code)) {
      seen.add(c.code);
      unique.push(c);
    }
  }

  if (unique.length > 0) {
    couponCache = unique;
    cacheTimestamp = now;
    logger.info(`[CouponFetcher] ✅ ${unique.length} cupons do dia capturados e armazenados no cache.`);
  } else {
    logger.info('[CouponFetcher] ℹ️ Nenhum cupom encontrado nas fontes.');
    if (couponCache.length === 0) {
      cacheTimestamp = now;
    }
  }

  return couponCache;
}

/**
 * Retorna os cupons atualmente em cache (sem disparar fetch).
 */
function getCachedCoupons() {
  return couponCache;
}

/**
 * Retorna o Cupom Ativo do Dia.
 * Retorna APENAS se houver cupom manual definido pelo usuário ou configurado no ambiente para hoje.
 * Se nenhum cupom manual estiver ativo, retorna null (modo automático, sem forçar cupons inventados).
 */
async function getActiveDailyCoupon() {
  const today = getTodayDateStr();

  // Cupom em memória só é válido se foi definido hoje e não estiver na lista de bloqueados
  if (inMemoryActiveCoupon) {
    if (BLOCKED_COUPON_CODES.has(inMemoryActiveCoupon) || inMemoryActiveCouponDate !== today) {
      inMemoryActiveCoupon = null;
      inMemoryActiveCouponDate = null;
    } else {
      return inMemoryActiveCoupon;
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    try {
      const repository = require('../database/repository');
      const raw = await repository.getSetting('active_daily_coupon');
      if (raw && raw.trim()) {
        const parts = raw.trim().split('|');
        let codeCandidate = null;
        if (parts.length === 2 && parts[0] === today) {
          codeCandidate = parts[1].toUpperCase();
        } else if (parts.length === 1 && parts[0]) {
          codeCandidate = parts[0].toUpperCase();
        }

        if (codeCandidate && !BLOCKED_COUPON_CODES.has(codeCandidate)) {
          inMemoryActiveCoupon = codeCandidate;
          inMemoryActiveCouponDate = today;
          return inMemoryActiveCoupon;
        } else if (codeCandidate && BLOCKED_COUPON_CODES.has(codeCandidate)) {
          // Limpa do banco se for cupom inválido como TUDOPARACASA
          await repository.setSetting('active_daily_coupon', '');
          inMemoryActiveCoupon = null;
          inMemoryActiveCouponDate = null;
        }
      }
    } catch (e) {
      logger.debug('[CouponFetcher] Erro ao ler active_daily_coupon do banco: ' + e.message);
    }
  }

  const envCoupon = process.env.ML_DAILY_COUPON || env.mlDailyCoupon;
  if (envCoupon && envCoupon.trim()) {
    const cleanEnv = envCoupon.trim().toUpperCase();
    if (!BLOCKED_COUPON_CODES.has(cleanEnv)) {
      inMemoryActiveCoupon = cleanEnv;
      inMemoryActiveCouponDate = today;
      return inMemoryActiveCoupon;
    }
  }

  // ⚠️ Sem cupom manual forçado: retorna null (dashboard exibe modo Automático)
  return null;
}

/**
 * Define manualmente o Cupom Ativo do Dia (salva em memória e no banco).
 */
async function setActiveDailyCoupon(code) {
  const clean = code ? String(code).trim().toUpperCase() : null;
  const today = getTodayDateStr();

  if (clean && BLOCKED_COUPON_CODES.has(clean)) {
    logger.warn(`[CouponFetcher] ⚠️ Tentativa de ativar cupom bloqueado (${clean}). Desativando cupom manual.`);
    inMemoryActiveCoupon = null;
    inMemoryActiveCouponDate = null;
    if (process.env.NODE_ENV !== 'test') {
      try {
        const repository = require('../database/repository');
        await repository.setSetting('active_daily_coupon', '');
      } catch (e) {}
    }
    return false;
  }

  inMemoryActiveCoupon = clean;
  inMemoryActiveCouponDate = clean ? today : null;

  if (process.env.NODE_ENV !== 'test') {
    try {
      const repository = require('../database/repository');
      if (clean) {
        // Salva no formato "YYYY-MM-DD|CODIGO" para permitir expiração diária
        await repository.setSetting('active_daily_coupon', `${today}|${clean}`);
        logger.info(`[CouponFetcher] 🎯 Cupom diário ativo definido: ${clean} (válido para ${today})`);
      } else {
        await repository.setSetting('active_daily_coupon', '');
        logger.info('[CouponFetcher] ℹ️ Cupom diário manual desativado (modo automático)');
      }
      return true;
    } catch (e) {
      logger.error('[CouponFetcher] Erro ao persistir active_daily_coupon: ' + e.message);
      return false;
    }
  }
  return true;
}

/**
 * Retorna o cupom mais relevante do cache para ser exibido na mensagem.
 * Prioriza cupons de Casa/Eletro e cupons com desconto definido.
 */
function getBestCouponForMessage() {
  if (couponCache.length === 0) return null;
  
  // Prioriza cupons da categoria Casa/Itens para casa válidos
  const homeCoupons = couponCache.filter(c => 
    isValidRealCouponCode(c.code) &&
    ((c.title && /casa|lar|eletro|refrigerador|cozinha/i.test(c.title)) ||
     (c.code && /CASA|LAR|ELETRO/i.test(c.code)))
  );
  if (homeCoupons.length > 0) {
    return homeCoupons[0];
  }

  // Prioriza cupons gerais válidos com desconto
  const validCoupons = couponCache.filter(c => isValidRealCouponCode(c.code));
  const withDiscount = validCoupons.filter(c => c.discount);
  return withDiscount.length > 0 ? withDiscount[0] : (validCoupons[0] || null);
}

/**
 * Resolve o cupom mais apropriado para um produto específico.
 * 1. Prioriza cupom ativo diário configurado manualmente para hoje
 * 2. Utiliza cupom real legítimo do próprio anúncio do produto (se houver)
 * 3. Se não houver cupom, retorna null (NÃO inventa cupom falso em produtos)
 */
async function resolveCouponForProduct(product) {
  // 1. Verifica se há cupom ativo manual configurado para hoje
  const activeDaily = await getActiveDailyCoupon();
  if (activeDaily) {
    return activeDaily;
  }

  // 2. Se o próprio anúncio veio com um cupom real
  if (product && product.coupon) {
    const raw = String(product.coupon).trim().toUpperCase();
    if (isValidRealCouponCode(raw)) {
      return raw;
    }
  }

  // 3. Sem cupom real: não usa cupom
  return null;
}

/**
 * Retorna a idade do cache formatada para exibição.
 */
function getCacheInfo() {
  if (cacheTimestamp === 0) return { age: null, count: 0, lastUpdate: null };
  const ageMs = Date.now() - cacheTimestamp;
  const ageMin = Math.round(ageMs / 60000);
  return {
    count: couponCache.length,
    ageMinutes: ageMin,
    lastUpdate: new Date(cacheTimestamp).toISOString(),
    isStale: ageMs >= CACHE_TTL_MS
  };
}

module.exports = {
  fetchDailyCoupons,
  getCachedCoupons,
  getBestCouponForMessage,
  getActiveDailyCoupon,
  setActiveDailyCoupon,
  resolveCouponForProduct,
  getCacheInfo
};
