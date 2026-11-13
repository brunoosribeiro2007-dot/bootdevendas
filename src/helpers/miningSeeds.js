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
    // Gabinetes Gamer
    'gabinete gamer aquario rise mode',
    'gabinete gamer lateral vidro',
    'gabinete mesh argb mid tower',
    'gabinete gamer redragon',
    // Consoles e Controles (PS5, DualSense)
    'console playstation 5 slim',
    'playstation 5 slim 1tb',
    'controle sony dualsense ps5',
    'controle sem fio dualsense ps5',
    // Televisão / Smart TV
    'smart tv 50 polegadas 4k',
    'smart tv 55 polegadas 4k',
    'smart tv oled 120hz',
    'smart tv gamer 4k 120hz',
    // Celulares de Alto Desempenho (Linha S25, iPhone)
    'smartphone samsung galaxy s25',
    'samsung galaxy s25 ultra',
    'samsung galaxy s24 ultra',
    'smartphone apple iphone 16',
    'smartphone apple iphone 16 pro',
    'smartphone apple iphone 15',
    // Informática & Hardware PC Gamer
    'notebook gamer rtx',
    'monitor gamer ips 144hz',
    'monitor gamer 240hz',
    'placa de video rtx 4060',
    'placa de video rtx 4070',
    'placa de video rx 6600',
    'processador ryzen 7 5700x3d',
    'processador ryzen 5 5600',
    'processador core i5 12400f',
    'placa mae b550',
    'ssd nvme 1tb',
    'ssd nvme gen4',
    'memoria ram ddr4 3200mhz',
    'memoria ram ddr5',
    'water cooler 240mm',
    'fonte modular 650w',
    'teclado mecanico switch red',
    'mouse sem fio paw3395',
    'headset 7.1 surround',
    'microfone condensador usb',
    'mousepad gamer speed grande',
    // Áudio e Caixas de Som de Qualidade
    'caixa de som bluetooth jbl',
    'caixa de som jbl flip',
    'caixa de som jbl charge',
    'caixa de som jbl go',
    'caixa de som edifier bluetooth',
    'soundbar gamer'
  ],
  casa: [
    'caixa de som bluetooth jbl',
    'soundbar jbl cinema',
    'soundbar samsung',
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

