/**
 * ==============================================================================
 * MINING SEEDS & DYNAMIC SEARCH HELPER (src/helpers/miningSeeds.js)
 * ==============================================================================
 * 1. Rotação dinâmica de seeds com offsets e ordenação randômica para evitar repetição.
 * 2. Extração estrita e verídica de cupons reais da API do Mercado Livre.
 * ==============================================================================
 */

const { normalizeNicheId } = require('../config/niches');
const logger = require('../config/logger');

const SEARCH_POOLS = {
  pc_gamer: [
    'ssd nvme gen4',
    'placa mae b550',
    'fonte modular 650w',
    'teclado mecanico switch red',
    'memoria ram ddr4 3200mhz',
    'memoria ram ddr5',
    'water cooler 240mm',
    'gabinete mesh argb',
    'headset 7.1 surround',
    'monitor gamer ips 144hz',
    'mouse sem fio paw3395',
    'placa de video rtx 4060',
    'placa de video rx 6600',
    'processador ryzen 5 5600',
    'processador ryzen 7 5700x3d',
    'processador core i5 12400f',
    'microfone condensador usb',
    'mousepad gamer speed grande'
  ],
  casa: [
    'panela de pressao eletrica inox',
    'aspirador vertical sem fio',
    'fritadeira sem oleo digital',
    'mop com balde centrifugador',
    'jogo toalhas banho fio penteado',
    'torneira monocomando flexivel',
    'organizador hermetico acrilico',
    'luminaria led inteligente wifi',
    'fogao de embutir 5 bocas',
    'cooktop 4 bocas vidro temperado',
    'jogo de panelas ceramic inox',
    'liquidificador potente 1200w',
    'purificador de agua refrigerado',
    'ferro a vapor ceramica',
    'adega climatizada 12 garrafas',
    'conjunto mesa sala de jantar 4 cadeiras'
  ]
};

/**
 * Retorna uma consulta dinâmica com termo aleatório, offset e ordenação.
 * Evita pegar sempre os mesmos 5 primeiros produtos da página 1.
 * @param {string} niche
 * @returns {{ query: string, offset: number, sort: string }}
 */
function getDynamicSearchQuery(niche) {
  const normalized = normalizeNicheId(niche);
  const list = SEARCH_POOLS[normalized] || SEARCH_POOLS.casa;
  const keyword = list[Math.floor(Math.random() * list.length)];

  // Offset aleatório para variar as páginas (0 a 30)
  const randomOffset = Math.floor(Math.random() * 30);
  const sort = Math.random() > 0.5 ? 'price_asc' : 'relevance';

  return {
    query: keyword,
    offset: randomOffset,
    sort
  };
}

/**
 * Extrai dados estritamente reais de cupom a partir do payload do anúncio.
 * NUNCA inventa ou deduz cupom fictício.
 * @param {object} itemData - Objeto bruto do produto retornado pela API do Mercado Livre.
 * @returns {{ coupon_code: string|null, coupon_min_value: number|null, has_coupon: boolean }}
 */
function extractRealCouponData(itemData) {
  if (!itemData || typeof itemData !== 'object') {
    return { coupon_code: null, coupon_min_value: null, has_coupon: false };
  }

  let code = null;
  let minValue = null;

  // 1. Extração via sale_terms (COUPON_CODE oficial da API)
  if (Array.isArray(itemData.sale_terms)) {
    const couponTerm = itemData.sale_terms.find(t => t.id === 'COUPON_CODE' || t.name === 'Cupom' || t.name === 'CUPOM');
    if (couponTerm && couponTerm.value_name) {
      code = String(couponTerm.value_name).trim().toUpperCase();
    }
  }

  // 2. Extração via tags oficiais da API
  if (!code && Array.isArray(itemData.tags)) {
    const couponTag = itemData.tags.find(t => typeof t === 'string' && (t.startsWith('coupon:') || t.startsWith('cupom:')));
    if (couponTag) {
      const parts = couponTag.split(':');
      if (parts[1] && parts[1].length >= 3) {
        code = parts[1].trim().toUpperCase();
      }
    }
  }

  // 3. Extração via deal_ids ou promoções oficiais se houver
  if (!code && itemData.coupon && typeof itemData.coupon === 'string') {
    const cleaned = itemData.coupon.trim().toUpperCase();
    // Validação estrita: rejeita frases promocionais que não sejam códigos alfanuméricos
    if (/^[A-Z0-9_-]{3,25}$/.test(cleaned) && !['GRATIS', 'FRETE', 'OFF', 'PROMO'].includes(cleaned)) {
      code = cleaned;
    }
  }

  // Se houver valor mínimo informado
  if (itemData.coupon_min_value && typeof itemData.coupon_min_value === 'number') {
    minValue = itemData.coupon_min_value;
  }

  return {
    coupon_code: code || null,
    coupon_min_value: minValue || null,
    has_coupon: !!code
  };
}

module.exports = {
  SEARCH_POOLS,
  getDynamicSearchQuery,
  extractRealCouponData
};

