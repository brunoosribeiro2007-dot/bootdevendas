/**
 * ==============================================================================
 * POST FORMATTER SERVICE - FORMATADOR DE POSTAGENS E GERADOR DE HEADLINES
 * ==============================================================================
 * Responsabilidades:
 * 1. Gerar chamada criativa em MAIÚSCULO via IA Google Gemini (@google/genai).
 * 2. Fallback inteligente para geração de headlines locais por regras/nicho.
 * 3. Montar a legenda (caption) final exatamente no template dos grandes canais.
 * ==============================================================================
 */

const { GoogleGenAI } = require('@google/genai');
const env = require('../config/env');
const logger = require('../config/logger');
const formatterService = require('./formatter.service');

class PostFormatterService {
  constructor() {
    this.ai = null;
    this.defaultStoreName = env.defaultStoreName || 'Oferta no Mercado Livre';

    // Inicializa o cliente oficial Google GenAI caso a chave esteja presente
    if (env.geminiApiKey) {
      try {
        this.ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
        logger.info('[PostFormatter] ✅ Cliente Google GenAI (Gemini) inicializado com sucesso.');
      } catch (err) {
        logger.warn(`[PostFormatter] ⚠️ Erro ao inicializar Gemini: ${err.message}`);
      }
    } else {
      logger.debug('[PostFormatter] GEMINI_API_KEY não configurada. Usando motor local de headlines como fallback.');
    }
  }

  /**
   * Gera uma chamada criativa em MAIÚSCULO usando o modelo Gemini 2.5 Flash.
   * Caso a API não esteja configurada ou ocorra erro, aciona o fallback por regras de nicho.
   * 
   * @param {string} productTitle - Título do produto.
   * @returns {Promise<string>} Chamada em maiúsculas (ex: "ACHADO IMPERDÍVEL PRA SUA COZINHA").
   */
  async generateCreativeHeadline(productTitle) {
    if (!productTitle) return 'ACHADO IMPERDÍVEL';

    // ─── 1. TENTA GERAR VIA GEMINI 2.5 FLASH ──────────────────────────────────
    if (this.ai) {
      try {
        const prompt = `Você é um copywriter de elite especialista em canais de ofertas de e-commerce no WhatsApp.
Crie UMA ÚNICA chamada promocional curta, impactante e vendedora em MAIÚSCULAS (entre 3 e 6 palavras) para o produto abaixo:
Produto: "${productTitle}"

Regras obrigatórias:
1. Retorne APENAS a frase em letras maiúsculas.
2. Não inclua aspas, asteriscos, emojis nem pontuação extra.
3. Foque em desejo, urgência ou benefício real.
Exemplos de tom desejado:
- PREÇO BAIXO PRA LEVAR AGORA
- ACHADO HISTÓRICO PRA SUA CASA
- SUPER DESCONTO EXCLUSIVO
- QUALIDADE MÁXIMA COM PREÇO BAIXO`;

        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });

        const headline = response.text ? response.text.trim().replace(/[*_`"']/g, '').toUpperCase() : '';
        if (headline && headline.length >= 5 && headline.length <= 60) {
          logger.info(`[PostFormatter] ✨ Headline gerada via Gemini: "${headline}"`);
          return headline;
        }
      } catch (geminiError) {
        logger.warn(`[PostFormatter] ⚠️ Falha na geração com Gemini (${geminiError.message}). Usando fallback local.`);
      }
    }

    // ─── 2. FALLBACK LOCAL POR REGRAS DE CATEGORIA E NICHO ────────────────────
    return formatterService.generateHeadline(productTitle);
  }

  /**
   * Formata o preço no padrão brasileiro (ex: 55 ou 1.299,90).
   * @param {number} price
   * @returns {string}
   */
  formatPrice(price) {
    if (price === null || price === undefined || isNaN(price)) return '0,00';
    if (Number.isInteger(price)) {
      return price.toLocaleString('pt-BR');
    }
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Monta o payload final da legenda (caption) exatamente no template solicitado:
   * 
   * *[CHAMADA CRIATIVA EM MAIÚSCULO]*
   * 
   * 🧙‍♂️ [Título do Produto]
   * 
   * 💸 *Por R$ [Preço]*
   * 🎟️ Use o cupom: [CUPOM] (se houver cupom)
   * 
   * [Nome da Loja ou "Oferta no Mercado Livre"]:
   * [Meu Link Afiliado meli.la]
   * 
   * @param {Object} params
   * @param {string} params.title - Título do produto.
   * @param {number} params.price - Preço numérico.
   * @param {number|null} [params.oldPrice] - Preço original antes do desconto (opcional).
   * @param {number|null} [params.discountPercent] - Percentual de desconto (opcional).
   * @param {string|null} [params.coupon] - Código de cupom (opcional).
   * @param {string} params.affiliateLink - Link meli.la gerado.
   * @param {string} [params.storeName] - Nome da loja (padrão: "Oferta no Mercado Livre").
   * @param {string} [params.customHeadline] - Chamada criativa pré-gerada (opcional).
   * @returns {Promise<string>} Legenda completa formatada.
   */
  async formatPost({ title, price, oldPrice, discountPercent, coupon, affiliateLink, storeName, customHeadline }) {
    // 1. Gera ou utiliza a chamada criativa
    const headline = customHeadline || await this.generateCreativeHeadline(title);

    // 2. Preço formatado
    const formattedPrice = this.formatPrice(price);

    // 3. Loja
    const storeLabel = storeName || this.defaultStoreName;

    // 4. Extrai código e regra do cupom se disponível
    let couponCode = null;
    let couponRule = '';

    if (coupon) {
      if (typeof coupon === 'object') {
        couponCode = coupon.code ? String(coupon.code).trim().toUpperCase() : null;
        couponRule = coupon.rule || coupon.description || '';
      } else if (typeof coupon === 'string' && coupon.trim().length > 0) {
        let clean = coupon.trim().toUpperCase();
        if (clean.startsWith('CUPOM ')) clean = clean.substring(6).trim();
        couponCode = clean;
      }
    }

    // 5. Montagem das linhas conforme o template
    const lines = [];

    // *[CHAMADA CRIATIVA EM MAIÚSCULO]*
    lines.push(`*${headline}*`);
    lines.push('');

    // 🔥 [Título do Produto]
    lines.push(`🔥 *${title.trim()}*`);
    lines.push('');

    // 💰 Preço antigo riscado (se houver)
    if (oldPrice && oldPrice > price) {
      lines.push(`De ~R$ ${this.formatPrice(oldPrice)}~`);
    }

    // 💰 Por apenas: R$ [Preço]
    lines.push(`💰 Por apenas: R$ ${formattedPrice}`);

    // 😱 Percentual de desconto
    let discount = discountPercent;
    if (!discount && oldPrice && oldPrice > price) {
      discount = Math.round(((oldPrice - price) / oldPrice) * 100);
    }
    if (discount && discount > 0) {
      lines.push(`😱 ${discount}% OFF`);
    }

    // 🎟️ Cupom diário: *[CÓDIGO]* ([Regra]) (só exibe se houver cupom ativo)
    if (couponCode && couponCode.length > 0) {
      const ruleText = couponRule && couponRule.trim().length > 0 ? ` (${couponRule.trim()})` : '';
      lines.push(`🎟️ Cupom diário: *${couponCode}*${ruleText}`);
    }

    lines.push('');

    // 🛒 Link de Afiliado
    lines.push(`🛒 Link: ${affiliateLink}`);

    // ⚠️ Aviso de limite de resgate (apenas se houver cupom)
    if (couponCode && couponCode.length > 0) {
      lines.push('');
      lines.push('⚠️ *Cupons possuem limite de resgate.*');
    }

    return lines.join('\n');
  }
}

module.exports = new PostFormatterService();
