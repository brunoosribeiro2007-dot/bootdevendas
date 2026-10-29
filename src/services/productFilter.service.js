/**
 * Product Filter Service
 * Responsável por validar se um produto cumpre todos os critérios rigorosos
 * de qualidade, reputação do vendedor, avaliações e desconto ativo.
 */

const env = require('../config/env');
const logger = require('../config/logger');

// Configurações padrão com fallback seguro
const CONFIG_DEFAULTS = {
  MIN_REVIEWS: 100,
  MIN_RATING: 4.5,
  MIN_DISCOUNT_PERCENT: 5,
  REQUIRE_DISCOUNT: true,
  REQUIRE_REPUTABLE_SELLER: true
};

/**
 * Obtém as configurações ativas com base nas variáveis de ambiente ou parâmetros personalizados.
 */
function getActiveConfig(customConfig = {}) {
  return {
    minReviews: customConfig.minReviews !== undefined 
      ? Number(customConfig.minReviews) 
      : (env.minReviews !== undefined ? env.minReviews : CONFIG_DEFAULTS.MIN_REVIEWS),
      
    minRating: customConfig.minRating !== undefined 
      ? Number(customConfig.minRating) 
      : (env.minRating !== undefined ? env.minRating : CONFIG_DEFAULTS.MIN_RATING),
      
    minDiscountPercent: customConfig.minDiscountPercent !== undefined 
      ? Number(customConfig.minDiscountPercent) 
      : (env.minDiscountPercent !== undefined ? env.minDiscountPercent : CONFIG_DEFAULTS.MIN_DISCOUNT_PERCENT),
      
    requireDiscount: customConfig.requireDiscount !== undefined 
      ? Boolean(customConfig.requireDiscount) 
      : (env.requireDiscount !== undefined ? env.requireDiscount : CONFIG_DEFAULTS.REQUIRE_DISCOUNT),
      
    requireReputableSeller: customConfig.requireReputableSeller !== undefined 
      ? Boolean(customConfig.requireReputableSeller) 
      : (env.requireReputableSeller !== undefined ? env.requireReputableSeller : CONFIG_DEFAULTS.REQUIRE_REPUTABLE_SELLER)
  };
}

/**
 * Verifica se o vendedor possui boa reputação comprovada:
 * - Loja Oficial do Mercado Livre
 * - MercadoLíder (Gold, Platinum ou Silver)
 * - Termômetro Verde / Nível 5 de Reputação
 * - Envio Full (Mercado Livre Fulfillment)
 */
function verificarReputacaoVendedor(produto) {
  if (!produto) return false;

  if (produto.isReputableSeller) return true;
  if (produto.isOfficialStore || produto.is_official_store || produto.officialStore || produto.official_store_id) return true;
  if (produto.isMercadoLider || produto.is_mercadolider) return true;
  if (produto.hasGreenThermometer || produto.has_green_thermometer || produto.hasGreenReputation || produto.has_green_reputation) return true;
  if (produto.isFull || produto.is_full) return true;

  // Análise textual de sellerInfo ou campos de texto do anúncio
  const sellerInfo = (produto.sellerInfo || produto.sellerReputation || produto.seller || '').toString().toLowerCase();
  if (
    sellerInfo.includes('loja oficial') ||
    sellerInfo.includes('mercadolíder') ||
    sellerInfo.includes('mercadolider') ||
    sellerInfo.includes('platinum') ||
    sellerInfo.includes('gold') ||
    sellerInfo.includes('termômetro verde') ||
    sellerInfo.includes('termometro verde') ||
    sellerInfo.includes('5_green') ||
    sellerInfo.includes('líder') ||
    sellerInfo.includes('lider')
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se o produto possui desconto ou promoção ativa:
 * - Percentual de desconto >= MIN_DISCOUNT_PERCENT
 * - Preço anterior maior que o preço atual (oldPrice > price)
 * - Selo de promoção ativa ("Oferta do Dia", "Oferta Relâmpago", etc.)
 * - Cupom de desconto ativo vinculado ao anúncio
 */
function verificarPromocaoAtiva(produto, minDiscountPercent = 5) {
  if (!produto) return false;

  // 1. Selos e badges de promoção ativa
  if (produto.hasPromotionBadge || produto.isDailyDeal || produto.isDeal) return true;

  // 2. Cupom ativo ou flag de desconto
  if (produto.coupon && typeof produto.coupon === 'string' && produto.coupon.trim().length > 0) return true;
  if (produto.hasDiscount) return true;

  // 3. Desconto percentual explícito
  const discount = Number(produto.discountPercent || produto.discount_percent || 0);
  if (discount >= minDiscountPercent) return true;

  // 4. Preço antigo x Preço atual
  const oldPrice = Number(produto.oldPrice || produto.old_price || 0);
  const currentPrice = Number(produto.price || 0);
  if (oldPrice > currentPrice && currentPrice > 0) {
    const calculatedDiscount = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
    if (calculatedDiscount >= minDiscountPercent) return true;
  }

  return false;
}

/**
 * Validação rigorosa de qualidade do produto:
 * 1. Avaliações: Quantidade mínima (MIN_REVIEWS >= 100)
 * 2. Nota média: Nota mínima (MIN_RATING >= 4.5)
 * 3. Desconto/Promoção: Desconto ativo ou selo de oferta (rejeita preço cheio)
 * 4. Reputação do vendedor: Loja oficial, MercadoLíder, Termômetro verde ou Full
 *
 * @param {Object} produto Dados do item a ser validado
 * @param {Object} [customConfig] Configurações opcionais
 * @returns {boolean} Retorna true APENAS se passar em todos os critérios
 */
function validarQualidadeProduto(produto, customConfig = {}) {
  if (!produto || typeof produto !== 'object') return false;

  const config = getActiveConfig(customConfig);

  // 1. Quantidade mínima de avaliações (>= 100)
  const reviewsCount = Number(produto.reviewsCount ?? produto.reviews_count ?? 0);
  if (reviewsCount < config.minReviews) {
    return false;
  }

  // 2. Nota média mínima (>= 4.5)
  const rating = Number(produto.rating ?? 0);
  if (isNaN(rating) || rating < config.minRating) {
    return false;
  }

  // 3. Promoção / Desconto ativo (ignora preço cheio)
  if (config.requireDiscount) {
    const hasPromo = verificarPromocaoAtiva(produto, config.minDiscountPercent);
    if (!hasPromo) {
      return false;
    }
  }

  // 4. Reputação do Vendedor
  if (config.requireReputableSeller) {
    const hasGoodReputation = verificarReputacaoVendedor(produto);
    if (!hasGoodReputation) {
      return false;
    }
  }

  return true;
}

/**
 * Retorna o motivo específico de reprovação do produto para logs claros.
 *
 * @param {Object} produto Dados do item
 * @param {Object} [customConfig] Configurações opcionais
 * @returns {string|null} Motivo detalhado ou null se for válido
 */
function obterMotivoReprovacao(produto, customConfig = {}) {
  if (!produto) return 'Produto inexistente ou inválido';

  const config = getActiveConfig(customConfig);

  const reviewsCount = Number(produto.reviewsCount ?? produto.reviews_count ?? 0);
  if (reviewsCount < config.minReviews) {
    return `Avaliações insuficientes (${reviewsCount} < ${config.minReviews} mínimas)`;
  }

  const rating = Number(produto.rating ?? 0);
  if (isNaN(rating) || rating < config.minRating) {
    return `Nota média insuficiente (${rating ? rating.toFixed(1) : '0.0'} < ${config.minRating} estrelas mínimas)`;
  }

  if (config.requireDiscount) {
    const hasPromo = verificarPromocaoAtiva(produto, config.minDiscountPercent);
    if (!hasPromo) {
      return `Sem desconto/promoção ativa (desconto mínimo de ${config.minDiscountPercent}% não atingido ou preço cheio)`;
    }
  }

  if (config.requireReputableSeller) {
    const hasGoodReputation = verificarReputacaoVendedor(produto);
    if (!hasGoodReputation) {
      return `Vendedor sem reputação qualificada (exige Loja Oficial, MercadoLíder, Termômetro Verde ou Full)`;
    }
  }

  return null;
}

module.exports = {
  validarQualidadeProduto,
  obterMotivoReprovacao,
  verificarReputacaoVendedor,
  verificarPromocaoAtiva,
  getActiveConfig,
  CONFIG_DEFAULTS
};
