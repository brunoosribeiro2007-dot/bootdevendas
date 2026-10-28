/**
 * ==============================================================================
 * COUPON FETCHER SERVICE - MÓDULO DE CAPTURA E GERENCIAMENTO DE CUPONS DIÁRIOS
 * ==============================================================================
 * Responsabilidades:
 * 1. Web Scraper e Collector de cupons vigentes no Mercado Livre (/cupons e /ofertas).
 * 2. Extração de código, regra/descrição, compra mínima e categoria/elegibilidade.
 * 3. Persistência e atualização contínua no banco de dados (SQLite/PostgreSQL).
 * 4. Associação inteligente do melhor cupom diário aplicável a cada produto.
 * 5. Cache em memória com renovação periódica e tolerância total a falhas de rede.
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const env = require('../config/env');
const repository = require('../database/repository');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Cache em memória de cupons do dia.
 * Renovado a cada ciclo ou a cada 1 hora.
 */
let couponCache = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
let inMemoryActiveCoupon = null;
let inMemoryActiveCouponDate = null;

// Termos e falsos positivos bloqueados
const BLOCKED_COUPON_CODES = new Set([
  'TUDOPARACASA', 'ILUMINESUACASA', 'CASAESADE', 'MELHORESOFERTAS',
  'ACESSRIOSPRAVOC', 'ITENSPARASUAMOTO', 'SOPAULOAUTOPEAS', 'VERECOMPRAR2024',
  'CAMAINBOXLOJAOFICIAL', 'OOCEANDROPSA97032', 'UNIVERSALCASES2', 'BLMOTOPARTS',
  'SAOPAULOACESSORIOS', 'ANIMAFESTCAMPINAS', 'BRIMPORTSPEAS', 'SHOPFLEXCOM',
  'CASA', 'LAR', 'ELETRO', 'OFF', 'CUPOM', 'DESCONTO', 'PRODUTO', 'PRODUTOS',
  'SELECIONADOS', 'COMPRA', 'MINIMA', 'SEMCOMPRA', 'FRETE', 'FRETEGRATIS',
  'CONFIRA', 'OFERTA', 'MELI', 'BR', 'MERCADOLIVRE'
]);

/**
 * Valida se a string tem formato aceitável para ser código de cupom real.
 * @param {string} c
 * @returns {boolean}
 */
function isValidRealCouponCode(c) {
  if (!c || typeof c !== 'string') return false;
  const clean = c.trim().toUpperCase();
  if (clean.length < 3 || clean.length > 25) return false;
  if (BLOCKED_COUPON_CODES.has(clean)) return false;
  // Bloqueia termos que são apenas palavras-chave soltas
  if (/^(OFF|DESCONTO|CUPOM|FRETE|REAIS)$/i.test(clean)) return false;
  return /^[A-Z0-9_-]+$/.test(clean);
}

/**
 * Retorna a data atual no fuso de Brasília (YYYY-MM-DD).
 */
function getTodayDateStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/**
 * Recupera cookies autenticados salvos do Mercado Livre.
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
 * Detecta a categoria de restrição do cupom a partir do texto ou título do card.
 * @param {string} text
 * @returns {string|null} 'casa', 'eletro', 'tech', 'moda', etc. ou null se geral.
 */
function detectCouponCategory(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase();

  // Eletrodomésticos
  if (/eletro|refrigera|geladeira|fog[aã]o|micro-?ondas|ar-condicionado|lavadora|liquidificador|air\s*fryer/i.test(t)) {
    return 'eletro';
  }
  // Casa / Decoração / Móveis
  if (/casa|m[oó]veis|decora|cozinha|cama|mesa|banho|colch[aã]o|sala|quarto|ilumina/i.test(t)) {
    return 'casa';
  }
  // Informática / Tecnologia / Celulares
  if (/inform[aá]tica|computador|notebook|celular|smartphone|tablet|tecnologia|gamer/i.test(t)) {
    return 'tech';
  }
  // Moda / Calçados
  if (/moda|roupas?|cal[cç]ados?|vestu[aá]rio|t[eê]nis/i.test(t)) {
    return 'moda';
  }
  // Beleza / Cuidados
  if (/beleza|perfumaria|cosm[eé]tico|cabelo/i.test(t)) {
    return 'beleza';
  }
  // Automotivo
  if (/auto|ve[ií]culo|moto|pe[cç]as/i.test(t)) {
    return 'auto';
  }

  return null;
}

/**
 * Identifica a categoria de um produto a partir do título para casar com o cupom.
 * @param {string} title
 * @returns {string|null}
 */
function detectProductCategory(title) {
  if (!title || typeof title !== 'string') return null;
  const t = title.toLowerCase();

  if (/geladeira|refrigerador|fog[aã]o|micro-?ondas|cooktop|lavadora|m[aá]quina de lavar|lava e seca|ar-condicionado|climatizador|ventilador|aspirador|air\s*fryer|fritadeira|liquidificador|batedeira|cafeteira|sanduicheira|mixer|eletro/i.test(t)) {
    return 'eletro';
  }
  if (/guarda-roupa|cama|mesa|cadeira|sof[aá]|sofa|colch[aã]o|travesseiro|arm[aá]rio|estante|rack|painel|cortina|tapete|decora|panela|jogo de panelas|faqueiro|edredom|len[cç]ol|toalha|cozinha|casa|banho/i.test(t)) {
    return 'casa';
  }
  if (/celular|smartphone|iphone|galaxy|xiaomi|notebook|computador|pc|tablet|ipad|monitor|teclado|mouse|headset|fone de ouvido|impressora/i.test(t)) {
    return 'tech';
  }
  if (/t[eê]nis|sapato|sand[aá]lia|bota|camisa|camiseta|cal[cç]a|jaqueta|casaco|bermuda|vestido|bolsa|mochila/i.test(t)) {
    return 'moda';
  }
  return null;
}

/**
 * Normaliza um cupom em um objeto rico com método toString() compatível com strings.
 */
function createCouponObject(data) {
  const code = String(data.code).trim().toUpperCase();
  const rule = data.rule || data.discount || '';
  const description = data.description || data.title || rule || '';
  const minAmount = typeof data.minAmount === 'number' ? data.minAmount : (typeof data.min_amount === 'number' ? data.min_amount : 0);
  const discountValue = data.discountValue !== undefined ? data.discountValue : (data.discount_value !== undefined ? data.discount_value : null);
  const discountType = data.discountType || data.discount_type || 'unknown';
  const category = data.category || null;
  const source = data.source || 'collector';

  const couponObj = {
    code,
    rule,
    description,
    minAmount,
    min_amount: minAmount,
    discountValue,
    discount_value: discountValue,
    discountType,
    discount_type: discountType,
    category,
    source,
    capturedAt: data.capturedAt || data.captured_at || new Date().toISOString(),
    // Garante que se for interpolado como string (ex: `${coupon}`), retorna o código do cupom
    toString: () => code
  };

  return couponObj;
}

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: ROTINAS DE CAPTURA (WEB SCRAPING & APIS DO MERCADO LIVRE)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Busca cupons via API pública do Mercado Livre (MLB search e promotions).
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
          const rawCode = typeof couponLabel === 'string' ? couponLabel : couponLabel.value_name || couponLabel.value_id;
          const cleanCode = rawCode ? rawCode.trim().toUpperCase() : null;
          if (cleanCode && isValidRealCouponCode(cleanCode) && !found.some(c => c.code === cleanCode)) {
            found.push(createCouponObject({
              code: cleanCode,
              description: `Cupom ${cleanCode}`,
              rule: 'Desconto no anúncio',
              source: 'api_search',
              minAmount: 0
            }));
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`[CouponFetcher] API source 1 indisponível: ${e.message}`);
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
        if (!code) continue;
        const cleanCode = String(code).trim().toUpperCase();
        if (!isValidRealCouponCode(cleanCode)) continue;

        let discountRule = null;
        let discountValue = null;
        let discountType = 'unknown';

        if (promo.discount_percent) {
          discountRule = `${promo.discount_percent}% de desconto`;
          discountValue = parseFloat(promo.discount_percent);
          discountType = 'percentage';
        } else if (promo.amount) {
          discountRule = `R$ ${promo.amount} OFF`;
          discountValue = parseFloat(promo.amount);
          discountType = 'fixed';
        }

        const minAmount = promo.min_amount || 0;
        const ruleWithMin = minAmount > 0 && discountRule ? `${discountRule} acima de R$ ${minAmount}` : (discountRule || `Cupom ${cleanCode}`);

        if (!found.some(c => c.code === cleanCode)) {
          found.push(createCouponObject({
            code: cleanCode,
            description: promo.title || promo.name || ruleWithMin,
            rule: ruleWithMin,
            category: detectCouponCategory(promo.title || promo.name || ''),
            discountValue,
            discountType,
            minAmount,
            source: 'api_promotions'
          }));
        }
      }
    }
  } catch (e) {
    logger.debug(`[CouponFetcher] API source 2 indisponível: ${e.message}`);
  }

  return found;
}

/**
 * Raspa a página oficial de cupons (https://www.mercadolivre.com.br/cupons)
 * e a central de ofertas do Mercado Livre.
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
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 400
      });

      const html = res.data;
      if (!html || typeof html !== 'string') continue;
      const $ = cheerio.load(html);

      // ─── 1. Cards de Cupons (.coupon-card e variações) ───────────────────────
      $('.coupon-card, [class*="coupon-card"], [class*="poly-coupon"], [class*="coupon-item"]').each((_, el) => {
        const fullText = $(el).text().replace(/\s+/g, ' ').trim();
        if (!fullText) return;

        // Extrai código explícito
        let code = '';
        const explicitCodeEl = $(el).find('.coupon-card__code, [class*="coupon-code"], [class*="coupon__code"], [class*="coupon-pill"]');
        if (explicitCodeEl.length > 0) {
          code = explicitCodeEl.first().text().trim().replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
        } else {
          const matchCode = fullText.match(/(?:c[oó]digo|cupom|use o cupom|c[oó]d\.?)\s*[:=-]?\s*([A-Za-z0-9_-]{3,20})/i);
          if (matchCode) {
            code = matchCode[1].toUpperCase();
          }
        }

        if (!code || !isValidRealCouponCode(code)) return;

        // Extrai desconto
        let discountRule = '';
        let discountValue = null;
        let discountType = 'unknown';

        const percentMatch = fullText.match(/(\d+)\s*%\s*(?:OFF|de desconto)/i);
        const fixedMatch = fullText.match(/R\$\s*([\d,.]+)\s*(?:OFF|de desconto)/i);

        if (percentMatch) {
          discountValue = parseInt(percentMatch[1], 10);
          discountType = 'percentage';
          discountRule = `${discountValue}% de desconto`;
        } else if (fixedMatch) {
          discountValue = parseFloat(fixedMatch[1].replace(/\./g, '').replace(',', '.'));
          discountType = 'fixed';
          discountRule = `R$ ${discountValue} OFF`;
        }

        // Extrai compra mínima
        let minAmount = 0;
        const minMatch = fullText.match(/(?:compra m[ií]nima|acima de|a partir de)\s*(?:de)?\s*R\$\s*([\d,.]+)/i);
        if (minMatch) {
          minAmount = parseFloat(minMatch[1].replace(/\./g, '').replace(',', '.'));
        }

        // Constrói regra descritiva completa (ex: "R$ 20 OFF acima de R$ 100")
        let fullRule = discountRule;
        if (discountRule && minAmount > 0) {
          fullRule = `${discountRule} acima de R$ ${minAmount}`;
        } else if (!fullRule && minAmount > 0) {
          fullRule = `Compra mínima de R$ ${minAmount}`;
        }

        // Título / descrição do escopo
        let title = '';
        const titleEl = $(el).find('h2, h3, p, span').first();
        if (titleEl.length > 0) {
          title = titleEl.text().replace(/\s+/g, ' ').trim();
        }
        if (!title) {
          title = fullRule || `Cupom ${code}`;
        }

        // Categoria / elegibilidade
        const category = detectCouponCategory(fullText);

        if (!found.some(c => c.code === code)) {
          found.push(createCouponObject({
            code,
            description: title,
            rule: fullRule || title,
            category,
            minAmount,
            discountValue,
            discountType,
            source: 'ml_cupons_page'
          }));
        }
      });

      // ─── 2. Pills e tags isoladas de cupom ──────────────────────────────────
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
            for (const c of codeMatch) {
              const cleanCode = c.trim().toUpperCase();
              if (isValidRealCouponCode(cleanCode) && !found.some(item => item.code === cleanCode)) {
                found.push(createCouponObject({
                  code: cleanCode,
                  description: `Cupom ${cleanCode}`,
                  rule: text !== cleanCode ? text : `Cupom ${cleanCode}`,
                  category: detectCouponCategory(text),
                  minAmount: 0,
                  source: 'html_pill'
                }));
              }
            }
          }
        });
      }

    } catch (e) {
      logger.debug(`[CouponFetcher] Scraping HTML falhou para ${url}: ${e.message}`);
    }
  }

  return found;
}

/**
 * Orquestra o ciclo de coleta diária de cupons:
 * 1. Dispara scrapers e APIs em paralelo.
 * 2. Salva e atualiza os cupons capturados no Banco de Dados.
 * 3. Alimenta o cache em memória para resposta instantânea.
 * 4. Fallback: Se a internet/ML falhar, carrega os cupons ativos já salvos no banco.
 * 
 * @param {boolean} forceRefresh - Força renovação imediata ignorando TTL do cache.
 * @returns {Promise<Array>} Lista de cupons ativos.
 */
async function fetchDailyCoupons(forceRefresh = false) {
  const now = Date.now();
  const cacheAge = now - cacheTimestamp;

  if (!forceRefresh && couponCache.length > 0 && cacheAge < CACHE_TTL_MS) {
    logger.debug(`[CouponFetcher] Retornando ${couponCache.length} cupons do cache (idade: ${Math.round(cacheAge / 60000)} min).`);
    return couponCache;
  }

  logger.info('🔄 [CouponFetcher] Buscando cupons vigentes no Mercado Livre...');

  try {
    const [apiResults, htmlResults] = await Promise.allSettled([
      fetchFromApi(),
      fetchFromHtml()
    ]);

    const collected = [];
    if (apiResults.status === 'fulfilled' && Array.isArray(apiResults.value)) {
      collected.push(...apiResults.value);
    }
    if (htmlResults.status === 'fulfilled' && Array.isArray(htmlResults.value)) {
      collected.push(...htmlResults.value);
    }

    // Deduplica por código
    const uniqueMap = new Map();
    for (const c of collected) {
      if (c && c.code && !uniqueMap.has(c.code)) {
        uniqueMap.set(c.code, c);
      }
    }

    const uniqueCoupons = Array.from(uniqueMap.values());

    // ─── Salva / atualiza no Banco de Dados ─────────────────────────────────
    if (uniqueCoupons.length > 0) {
      try {
        await repository.saveCouponsBatch(uniqueCoupons);
        logger.info(`✅ [CouponFetcher] ${uniqueCoupons.length} cupons capturados e persistidos no banco de dados.`);
      } catch (dbErr) {
        logger.warn(`⚠️ [CouponFetcher] Falha ao persistir cupons no banco: ${dbErr.message}`);
      }
    }

    // Carrega todos os cupons ativos diretamente do banco de dados
    let dbActiveCoupons = [];
    try {
      dbActiveCoupons = await repository.getActiveCoupons();
    } catch (dbReadErr) {
      logger.warn(`⚠️ [CouponFetcher] Falha ao ler cupons do banco: ${dbReadErr.message}`);
    }

    if (dbActiveCoupons && dbActiveCoupons.length > 0) {
      couponCache = dbActiveCoupons.map(createCouponObject);
      cacheTimestamp = now;
      logger.info(`🎯 [CouponFetcher] Cache atualizado com ${couponCache.length} cupons ativos do banco.`);
    } else if (uniqueCoupons.length > 0) {
      couponCache = uniqueCoupons;
      cacheTimestamp = now;
    } else {
      logger.info('[CouponFetcher] ℹ️ Nenhum cupom público encontrado nesta rodada.');
      if (couponCache.length === 0) {
        cacheTimestamp = now;
      }
    }

    return couponCache;

  } catch (error) {
    logger.error(`❌ [CouponFetcher] Erro inesperado na captura de cupons: ${error.message}`);
    // Fallback: tenta recuperar do banco
    try {
      const fallbackCoupons = await repository.getActiveCoupons();
      if (fallbackCoupons && fallbackCoupons.length > 0) {
        couponCache = fallbackCoupons.map(createCouponObject);
        return couponCache;
      }
    } catch (e) {}

    return couponCache;
  }
}

/**
 * Retorna os cupons atualmente em cache (síncrono, sem fetch).
 */
function getCachedCoupons() {
  return couponCache;
}

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: LÓGICA DE ASSOCIAÇÃO DO MELHOR CUPOM AO PRODUTO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Avalia todos os cupons ativos no banco e seleciona o mais vantajoso ou o mais
 * geral para o produto especificado.
 * 
 * Regras:
 * 1. Preço do produto deve ser maior ou igual a compra mínima (min_amount) do cupom.
 * 2. Se o cupom tiver restrição de categoria, valida com as palavras-chave do título.
 * 3. Calcula a vantagem financeira real em R$ (desconto fixo ou percentual sobre o preço).
 * 4. Desempate: Maior economia > Cupom de categoria específica > Menor compra mínima.
 * 
 * @param {Object} product - Produto contendo { title, price, category, ... }
 * @returns {Promise<Object|null>} Cupom selecionado ou null.
 */
async function findBestCouponForProduct(product) {
  if (!product) return null;

  const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
  const title = (product.title || '').trim();
  const productCategory = detectProductCategory(title);

  // Busca cupons ativos: primeiro do banco, fallback para cache
  let activeList = [];
  try {
    const fromDb = await repository.getActiveCoupons();
    if (fromDb && fromDb.length > 0) {
      activeList = fromDb.map(createCouponObject);
    }
  } catch (e) {
    logger.debug('[CouponFetcher] Erro ao buscar cupons ativos do banco: ' + e.message);
  }

  if (activeList.length === 0) {
    activeList = couponCache;
  }

  if (!activeList || activeList.length === 0) {
    return null;
  }

  // 1. Filtragem por elegibilidade
  const eligibleCoupons = activeList.filter(c => {
    if (!c.code || !isValidRealCouponCode(c.code)) return false;

    // Regra de valor mínimo de compra
    const min = c.minAmount || c.min_amount || 0;
    if (min > 0 && price > 0 && price < min) {
      return false;
    }

    // Regra de categoria / elegibilidade
    if (c.category && c.category !== 'geral') {
      // Se o cupom for restrito a uma categoria e identificamos a categoria do produto
      if (productCategory && c.category !== productCategory) {
        // Exceção de compatibilidade: Eletrodomésticos e Casa frequentemente compartilham campanhas
        const isHomeEletroCross = (c.category === 'casa' && productCategory === 'eletro') || (c.category === 'eletro' && productCategory === 'casa');
        if (!isHomeEletroCross) {
          return false;
        }
      } else if (!productCategory) {
        // Produto sem categoria clara: não arrisca associar cupom estritamente restrito
        return false;
      }
    }

    return true;
  });

  if (eligibleCoupons.length === 0) {
    return null;
  }

  // 2. Cálculo da vantagem financeira de cada cupom para ordenação
  const scoredCoupons = eligibleCoupons.map(c => {
    let savings = 0;
    const val = c.discountValue !== undefined ? c.discountValue : c.discount_value;
    const type = c.discountType || c.discount_type;

    if (type === 'percentage' && val && price > 0) {
      savings = price * (val / 100);
    } else if (type === 'fixed' && val) {
      savings = val;
    } else if (c.rule) {
      const pMatch = c.rule.match(/(\d+)\s*%/);
      const fMatch = c.rule.match(/R\$\s*([\d,.]+)/i);
      if (pMatch && price > 0) {
        savings = price * (parseInt(pMatch[1], 10) / 100);
      } else if (fMatch) {
        savings = parseFloat(fMatch[1].replace(/\./g, '').replace(',', '.'));
      }
    }

    const isCategorySpecific = (c.category && c.category === productCategory) ? 1 : 0;
    const minAmount = c.minAmount || c.min_amount || 0;

    return {
      coupon: c,
      savings,
      isCategorySpecific,
      minAmount
    };
  });

  // Ordena pelo melhor benefício:
  // 1) Maior economia em R$
  // 2) Cupom de categoria específica antes de cupom genérico
  // 3) Menor valor de compra mínima
  scoredCoupons.sort((a, b) => {
    if (b.savings !== a.savings) {
      return b.savings - a.savings;
    }
    if (b.isCategorySpecific !== a.isCategorySpecific) {
      return b.isCategorySpecific - a.isCategorySpecific;
    }
    return a.minAmount - b.minAmount;
  });

  const best = scoredCoupons[0].coupon;
  return createCouponObject(best);
}

/**
 * Retorna o Cupom Ativo do Dia configurado manualmente pelo usuário.
 */
async function getActiveDailyCoupon() {
  const today = getTodayDateStr();

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

  return null;
}

/**
 * Define manualmente o Cupom Ativo do Dia (salva em memória e no banco).
 */
async function setActiveDailyCoupon(code) {
  const clean = code ? String(code).trim().toUpperCase() : null;
  const today = getTodayDateStr();

  if (clean && BLOCKED_COUPON_CODES.has(clean)) {
    logger.warn(`[CouponFetcher] ⚠️ Tentativa de ativar cupom bloqueado (${clean}).`);
    inMemoryActiveCoupon = null;
    inMemoryActiveCouponDate = null;
    if (process.env.NODE_ENV !== 'test') {
      try {
        await repository.setSetting('active_daily_coupon', '');
      } catch (e) {}
    }
    return false;
  }

  inMemoryActiveCoupon = clean;
  inMemoryActiveCouponDate = clean ? today : null;

  if (process.env.NODE_ENV !== 'test') {
    try {
      if (clean) {
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
 * Extrai um código de cupom limpo a partir de qualquer string promocional.
 */
function extractCouponCode(input) {
  if (!input || typeof input !== 'string') return null;
  const cleanStr = input.trim().toUpperCase();

  if (isValidRealCouponCode(cleanStr)) {
    return cleanStr;
  }

  const matchPrefix = input.match(/(?:cupom|c[oó]digo|use o cupom|c[oó]d\.?)\s*[:=-]?\s*([A-Za-z0-9_-]{3,25})/i);
  if (matchPrefix) {
    const candidate = matchPrefix[1].trim().toUpperCase();
    if (isValidRealCouponCode(candidate)) {
      return candidate;
    }
  }

  const tokens = input.split(/[\s,.:;!?"'()\[\]{}–—-]+/);
  for (const token of tokens) {
    const cleanToken = token.trim().toUpperCase();
    if (isValidRealCouponCode(cleanToken)) {
      return cleanToken;
    }
  }

  return null;
}

/**
 * Resolve o cupom mais apropriado para o produto (fluxo de postagem).
 * Prioridade:
 * 1. Cupom diário ativo configurado manualmente pelo usuário.
 * 2. Cupom próprio do produto se veio com código explícito.
 * 3. Melhor cupom diário ativo encontrado no Banco de Dados.
 * 
 * @param {Object} product
 * @returns {Promise<Object|null>} Objeto com { code, rule, description } ou null.
 */
async function resolveCouponForProduct(product) {
  try {
    // 1. Verifica se há cupom ativo manual configurado para hoje
    const activeDailyCode = await getActiveDailyCoupon();
    if (activeDailyCode) {
      // Busca dados complementares do cupom no banco (regra/descrição) se existirem
      let rule = '';
      let description = '';
      try {
        const found = await repository.getCouponByCode(activeDailyCode);
        if (found) {
          rule = found.rule || found.description || '';
          description = found.description || '';
        }
      } catch (e) {}

      return createCouponObject({
        code: activeDailyCode,
        rule,
        description,
        source: 'manual_active'
      });
    }

    // 2. Se o próprio anúncio já veio com um cupom real
    if (product && product.coupon) {
      const rawCoupon = typeof product.coupon === 'object' ? product.coupon.code : product.coupon;
      const extracted = extractCouponCode(rawCoupon);
      if (extracted) {
        // Tenta obter descrição da base
        let rule = (typeof product.coupon === 'object' && product.coupon.rule) ? product.coupon.rule : '';
        let description = (typeof product.coupon === 'object' && product.coupon.description) ? product.coupon.description : '';
        try {
          const found = await repository.getCouponByCode(extracted);
          if (found) {
            rule = rule || found.rule || '';
            description = description || found.description || '';
          }
        } catch (e) {}

        return createCouponObject({
          code: extracted,
          rule,
          description,
          source: 'product_announcement'
        });
      }
    }

    // 3. Busca o melhor cupom ativo no banco de dados aplicável ao produto
    const best = await findBestCouponForProduct(product);
    if (best) {
      return best;
    }

    return null;
  } catch (error) {
    logger.warn(`⚠️ [CouponFetcher] Erro ao resolver cupom para produto: ${error.message}`);
    return null;
  }
}

/**
 * Helper de compatibilidade: retorna o código do melhor cupom em string.
 */
function getBestCouponForMessage(product = null) {
  if (couponCache.length === 0) return null;
  const best = couponCache.find(c => isValidRealCouponCode(c.code));
  return best ? best.code : null;
}

/**
 * Retorna metadados do cache para exibição no dashboard.
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
  findBestCouponForProduct,
  extractCouponCode,
  isValidRealCouponCode,
  createCouponObject,
  getCacheInfo
};
