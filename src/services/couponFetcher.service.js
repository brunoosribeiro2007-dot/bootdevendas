const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

/**
 * Cache em memória de cupons do dia.
 * Renovado a cada ciclo de captura (TTL de 1 hora).
 */
let couponCache = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Busca cupons do dia via API pública do Mercado Livre (MLB/promotions e tags de cupom).
 */
async function fetchFromApi() {
  const found = [];
  try {
    // Fonte 1: endpoint de busca com filtro de cupom
    const res = await axios.get('https://api.mercadolibre.com/sites/MLB/search?tag=best_seller&has_discount=true&limit=50&sort=relevance', {
      headers: {
        'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 8000
    });

    if (res.data && res.data.results) {
      for (const item of res.data.results) {
        // Alguns resultados carregam discount_label ou coupon no JSON
        const couponLabel = item.discount_label || (item.attributes && item.attributes.find(a => a.id === 'COUPON_CODE'));
        if (couponLabel) {
          const code = typeof couponLabel === 'string' ? couponLabel : couponLabel.value_name || couponLabel.value_id;
          if (code && !found.find(c => c.code === code)) {
            found.push({ code, source: 'api_search', discount: null, capturedAt: new Date().toISOString() });
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`[CouponFetcher] API source 1 failed: ${e.message}`);
  }

  try {
    // Fonte 2: endpoint específico de cupons/promoções
    const res2 = await axios.get('https://api.mercadolibre.com/sites/MLB/promotions?type=coupon', {
      headers: {
        'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 8000
    });
    if (res2.data && Array.isArray(res2.data)) {
      for (const promo of res2.data) {
        const code = promo.code || promo.coupon_code || promo.id;
        const discount = promo.discount_percent || promo.amount || null;
        if (code && !found.find(c => c.code === code)) {
          found.push({ code, source: 'api_promotions', discount, capturedAt: new Date().toISOString() });
        }
      }
    }
  } catch (e) {
    logger.debug(`[CouponFetcher] API source 2 failed: ${e.message}`);
  }

  return found;
}

/**
 * Busca cupons via scraping da página de cupons do Mercado Livre.
 */
async function fetchFromHtml() {
  const found = [];
  const urls = [
    'https://www.mercadolivre.com.br/cupons-desconto',
    'https://www.mercadolivre.com.br/ofertas#nav-header',
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Accept': 'text/html,application/xhtml+xml'
        },
        timeout: 10000
      });

      const html = res.data;
      const $ = cheerio.load(html);

      // Seletores comuns de cupom nas páginas do ML
      const selectors = [
        '.coupon-card__code',
        '[class*="coupon-code"]',
        '[class*="coupon__code"]',
        '.poly-coupons__pill',
        '[class*="coupons__pill"]',
        '[class*="coupon-pill"]',
        '[data-testid*="coupon"]',
        '.ui-pdp-promotions-pill__text',
      ];

      for (const sel of selectors) {
        $(sel).each((_, el) => {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          // Extrair apenas o código (palavra em maiúsculas separada, padrão ML)
          const codeMatch = text.match(/\b([A-Z0-9]{4,20})\b/g);
          if (codeMatch) {
            for (const code of codeMatch) {
              if (!found.find(c => c.code === code)) {
                found.push({ code, source: 'html_scrape', discount: null, capturedAt: new Date().toISOString() });
              }
            }
          }
        });
      }

      // Busca cupons em dados embutidos nos scripts (window.__PRELOADED_STATE__)
      const scriptContent = html.match(/"coupon[_-]?code"\s*:\s*"([^"]+)"/gi) || [];
      for (const match of scriptContent) {
        const codeMatch = match.match(/"([A-Z0-9]{4,20})"/);
        if (codeMatch && !found.find(c => c.code === codeMatch[1])) {
          found.push({ code: codeMatch[1], source: 'html_json_embed', discount: null, capturedAt: new Date().toISOString() });
        }
      }

    } catch (e) {
      logger.debug(`[CouponFetcher] HTML scrape failed for ${url}: ${e.message}`);
    }
  }

  return found;
}

/**
 * Busca cupons do dia combinando API e scraping HTML.
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
    logger.info('[CouponFetcher] ℹ️ Nenhum cupom do dia encontrado nas fontes públicas.');
    // Mantém cache anterior se houver
    if (couponCache.length === 0) {
      cacheTimestamp = now; // evita ficar refazendo a cada chamada se não houver cupons
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
 * Retorna o cupom mais relevante do cache para ser exibido na mensagem.
 * Prioriza cupons com desconto definido.
 */
function getBestCouponForMessage() {
  if (couponCache.length === 0) return null;
  // Prioriza com desconto, depois o primeiro disponível
  const withDiscount = couponCache.filter(c => c.discount);
  return withDiscount.length > 0 ? withDiscount[0] : couponCache[0];
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
  getCacheInfo
};
