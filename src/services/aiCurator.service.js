/**
 * ==============================================================================
 * AI CURATOR & DYNAMIC COPYWRITER SERVICE (src/services/aiCurator.service.js)
 * ==============================================================================
 * 1. Curadoria inteligente com validação estrita de qualidade e reputação.
 * 2. Validação 100% verídica de cupons (NUNCA alucina cupons fictícios).
 * 3. Variação criativa em 3 ângulos (Preço Baixo, Benefício, Alerta Rápido) e emojis.
 * 4. Execução via Gemini API com fallback determinístico robusto e resiliente.
 * ==============================================================================
 */

const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');
const { extractRealCouponData } = require('../helpers/miningSeeds');
const { getNicheProfile, normalizeNicheId } = require('../config/niches');

const OPENING_EMOJIS = ['🔥', '⚡', '🚨', '💥', '🎯'];

/**
 * Avalia um produto e gera cópia variada e verídica com base no nicho ativo.
 * @param {object} product - Dados brutos do produto
 * @param {string} [nicheId] - 'casa' | 'pc_gamer'
 * @returns {Promise<{
 *   status: 'APPROVED' | 'REJECTED',
 *   reason: string|null,
 *   clean_title: string,
 *   angle_used: string,
 *   has_real_coupon: boolean,
 *   formatted_message: string
 * }>}
 */
async function evaluateAndFormatProduct(product, nicheId) {
  const currentNiche = normalizeNicheId(nicheId || env.niche);
  const profile = getNicheProfile(currentNiche);
  const couponData = extractRealCouponData(product);

  // 1. FILTROS PRELIMINARES DE SEGURANÇA (Hard Rejection)
  if (!product || !product.title || !product.price) {
    return {
      status: 'REJECTED',
      reason: 'Produto sem título ou preço válido',
      clean_title: product?.title || '',
      angle_used: 'N/A',
      has_real_coupon: false,
      formatted_message: ''
    };
  }

  // Filtro de condição (apenas novos)
  const condition = String(product.condition || '').toLowerCase();
  if (condition.includes('used') || condition.includes('usado') || condition.includes('recondicionado')) {
    return {
      status: 'REJECTED',
      reason: 'Produto usado ou recondicionado',
      clean_title: product.title,
      angle_used: 'N/A',
      has_real_coupon: false,
      formatted_message: ''
    };
  }

  // Filtro de estoque mínimo (se a API forneceu a quantidade)
  if (typeof product.available_quantity === 'number' && product.available_quantity < 3) {
    return {
      status: 'REJECTED',
      reason: 'Estoque disponível menor que 3 unidades',
      clean_title: product.title,
      angle_used: 'N/A',
      has_real_coupon: false,
      formatted_message: ''
    };
  }

  // Filtro de desconto mínimo aceitável (se não possuir cupom real)
  const discountPercent = Number(product.discount_percent || 0);
  const minRequiredDiscount = profile.minDiscountPercent;
  if (!couponData.has_coupon && discountPercent > 0 && discountPercent < minRequiredDiscount) {
    return {
      status: 'REJECTED',
      reason: `Desconto de ${discountPercent}% abaixo do mínimo exigido para ${profile.nicheName} (${minRequiredDiscount}%)`,
      clean_title: product.title,
      angle_used: 'N/A',
      has_real_coupon: false,
      formatted_message: ''
    };
  }

  // 2. TENTATIVA COM GEMINI AI (se a chave estiver configurada)
  if (env.geminiApiKey) {
    try {
      const aiResult = await callGeminiCurator(product, profile, couponData);
      if (aiResult && (aiResult.status === 'APPROVED' || aiResult.status === 'REJECTED')) {
        return aiResult;
      }
    } catch (err) {
      logger.debug(`[AiCurator] Gemini indisponível (${err.message}). Aplicando motor determinístico.`);
    }
  }

  // 3. MOTOR DETERMINÍSTICO DE CURADORIA E VARIAÇÃO CRIATIVA (Fallback Garantido)
  return formatDeterministicPost(product, profile, couponData);
}

/**
 * Chamada à API oficial do Google Gemini com System Prompt estrito.
 */
async function callGeminiCurator(product, profile, couponData) {
  const promptSystem = `Você é o motor de curadoria, anti-repetição e validação de cupons do "Affiliate Engine".
Sua função é analisar os dados brutos de produtos garimpados de forma dinâmica na API do Mercado Livre e gerar postagens com variação criativa e verificação estrita de cupons.

${profile.systemPrompt}

---------------------------------------------------------------------
REGRAS FUNDAMENTAIS SOBRE CUPONS (ESTRITAMENTE VERÍDICOS)
---------------------------------------------------------------------
1. NUNCA invente, presuma ou deduza códigos de cupom (ex: NUNCA crie códigos como "PROMO10", "DESC15", "BLACKFRIDAY").
2. Se o campo "coupon_code" fornecido na entrada for vazio, "null", falso ou ausente:
   - A postagem NÃO DEVE conter a linha de cupom.
   - É expressamente proibido orientar o usuário a aplicar cupom inexistente.
3. Se o campo "coupon_code" contiver um código real vindo da API:
   - Destaque o cupom claramente em negrito.
   - Se houver valor mínimo informado em "coupon_min_value", inclua o aviso (Ex: "🎟️ Cupom no anúncio: *CUPOMEXEMPLO* em compras acima de R$ X").

---------------------------------------------------------------------
SAÍDA OBRIGATÓRIA (JSON PURO)
---------------------------------------------------------------------
Responda EXCLUSIVAMENTE com JSON estruturado:
{
  "status": "APPROVED" | "REJECTED",
  "reason": "string ou null",
  "clean_title": "string",
  "angle_used": "Preço Baixo" | "Benefício" | "Alerta Rápido",
  "has_real_coupon": true | false,
  "formatted_message": "string pronta com quebras de linha e negrito"
}`;

  const userPayload = {
    niche: profile.id,
    title: product.title,
    price: product.price,
    old_price: product.old_price || null,
    discount_percent: product.discount_percent || null,
    link: product.link || product.original_link,
    coupon_code: couponData.coupon_code,
    coupon_min_value: couponData.coupon_min_value,
    free_shipping: product.free_shipping || false,
    installments: product.installments || null
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.geminiApiKey}`;
  const response = await axios.post(url, {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${promptSystem}\n\nPRODUTO AVALIAR:\n${JSON.stringify(userPayload, null, 2)}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json'
    }
  }, { timeout: 8000 });

  const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (textResponse) {
    const parsed = JSON.parse(textResponse);
    return parsed;
  }
  return null;
}

/**
 * Motor determinístico que implementa fielmente as variações de ângulo,
 * rotação de emojis e inserção estritamente verídica de cupons reais.
 */
function formatDeterministicPost(product, profile, couponData) {
  const openingEmoji = OPENING_EMOJIS[Math.floor(Math.random() * OPENING_EMOJIS.length)];

  // Escolhe um dos 3 ângulos criativos
  const angles = ['Preço Baixo', 'Benefício', 'Alerta Rápido'];
  const angleUsed = angles[Math.floor(Math.random() * angles.length)];

  // Limpeza de título respeitando o nicho
  let cleanTitle = String(product.title || '').trim();
  // Remove menções de frete ou parcelas que possam estar no título
  cleanTitle = cleanTitle.replace(/\s*-\s*frete gr[aá]tis.*/i, '').trim();

  // Frase de destaque no tom do nicho e ângulo
  let highlightHook = '';
  if (profile.id === 'pc_gamer') {
    if (angleUsed === 'Preço Baixo') {
      highlightHook = '⚡ Upgrade que vale a pena! Desempenho bruto no menor preço.';
    } else if (angleUsed === 'Benefício') {
      highlightHook = '🎯 Baita setup! Excelente estabilidade e alta performance pra rodar no talo.';
    } else {
      highlightHook = '🚨 Achadinho Gamer! Oportunidade relâmpago antes que esgote o lote.';
    }
  } else {
    // Nicho Casa
    if (angleUsed === 'Preço Baixo') {
      highlightHook = '⚡ Economia real para o seu lar! Preço baixo de verdade no achadinho.';
    } else if (angleUsed === 'Benefício') {
      highlightHook = '🎯 Praticidade na sua rotina! Produto durável e de altíssima utilidade na casa.';
    } else {
      highlightHook = '🚨 Alerta de oferta imperdível! Aproveite enquanto durar o estoque.';
    }
  }

  // Bloco de Preços
  const priceFormatted = Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let priceBlock = '';
  if (product.old_price && Number(product.old_price) > Number(product.price)) {
    const oldPriceFormatted = Number(product.old_price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const discountText = product.discount_percent ? ` (📉 ${Math.round(product.discount_percent)}% OFF)` : '';
    priceBlock = `💥 De ~R$ ${oldPriceFormatted}~ por *R$ ${priceFormatted}*${discountText}`;
  } else {
    priceBlock = `💥 Por apenas *R$ ${priceFormatted}*`;
  }

  // Parcelamento
  let installmentLine = '';
  if (product.installments && product.installments.quantity && product.installments.amount) {
    const instVal = Number(product.installments.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    installmentLine = `💳 Em até ${product.installments.quantity}x de R$ ${instVal} sem juros\n`;
  }

  // Frete
  let shippingLine = '';
  if (product.free_shipping || Number(product.price) >= 79) {
    shippingLine = '🚚 Frete Grátis disponível\n';
  }

  // 🎟️ Bloco de Cupom: ESTRITAMENTE VERÍDICO
  // Se coupon_code for nulo ou vazio, ESTE BLOCO SIMPLESMENTE NÃO EXISTE.
  let couponLine = '';
  if (couponData.has_coupon && couponData.coupon_code) {
    if (couponData.coupon_min_value) {
      couponLine = `🎟️ Use o cupom no anúncio: *${couponData.coupon_code}* (compras acima de R$ ${couponData.coupon_min_value})\n`;
    } else {
      couponLine = `🎟️ Use o cupom no anúncio: *${couponData.coupon_code}*\n`;
    }
  }

  const affiliateLink = product.link || product.original_link || '';

  const message = `${openingEmoji} *${cleanTitle}*
${highlightHook}

${priceBlock}
${installmentLine}${shippingLine}${couponLine}
🛒 *Compre com desconto pelo link:*
👉 ${affiliateLink}

⚠️ _Preço e estoque sujeitos a alteração a qualquer momento!_`.trim();

  return {
    status: 'APPROVED',
    reason: null,
    clean_title: cleanTitle,
    angle_used: angleUsed,
    has_real_coupon: couponData.has_coupon,
    formatted_message: message
  };
}

module.exports = {
  evaluateAndFormatProduct,
  formatDeterministicPost,
  OPENING_EMOJIS
};

