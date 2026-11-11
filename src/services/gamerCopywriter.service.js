/**
 * Gamer Copywriter Service
 * Gera templates dinâmicos de copywriting de alta conversão para WhatsApp e Telegram,
 * com suporte a tags de afiliados (Mercado Livre, Amazon, Shopee), cálculo de menor preço,
 * parcelamento, frete grátis e cupons de desconto.
 */

const gamerClassifier = require('./gamerClassifier.service');
const axios = require('axios');
const logger = require('../config/logger');
const env = require('../config/env');

class GamerCopywriterService {
  constructor() {
    this.shortenerTimeout = 6000;
  }

  /**
   * Encurta URL longa usando serviços confiáveis com fallback em cascata
   */
  async shortenUrl(longUrl) {
    if (!longUrl || typeof longUrl !== 'string') return longUrl;

    // Se já for um link curto, retorna direto
    if (/meli\.la|shope\.ee|amzn\.to|t\.co|bit\.ly|is\.gd|tinyurl\.com/i.test(longUrl)) {
      return longUrl;
    }

    // Provedor 1: is.gd (direto e sem anúncios/redirecionamentos de terceiros)
    try {
      const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, {
        timeout: this.shortenerTimeout
      });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        return res.data.trim();
      }
    } catch (e) {
      logger.debug(`is.gd falhou: ${e.message}`);
    }

    // Provedor 2: v.gd
    try {
      const res = await axios.get(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`, {
        timeout: this.shortenerTimeout
      });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        return res.data.trim();
      }
    } catch (e) {
      logger.debug(`v.gd falhou: ${e.message}`);
    }

    // Provedor 3: TinyURL
    try {
      const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`, {
        timeout: this.shortenerTimeout
      });
      if (res.data && typeof res.data === 'string' && res.data.startsWith('http')) {
        return res.data.trim();
      }
    } catch (e) {
      logger.debug(`TinyURL falhou: ${e.message}`);
    }

    return longUrl;
  }

  /**
   * Injeta a tag de afiliado de acordo com a plataforma (Mercado Livre, Amazon, Shopee)
   */
  applyAffiliateTag(rawUrl, platform = 'auto') {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

    const url = rawUrl.trim();
    const isMeli = url.includes('mercadolivre.com') || url.includes('mercadolivre.com.br') || platform === 'mercadolivre';
    const isAmazon = url.includes('amazon.com') || url.includes('amazon.com.br') || platform === 'amazon';
    const isShopee = url.includes('shopee.com') || url.includes('shopee.com.br') || platform === 'shopee';

    // 1. Amazon
    if (isAmazon) {
      const amazonTag = process.env.AMAZON_AFFILIATE_TAG || 'gamerpc-20';
      try {
        const parsed = new URL(url);
        parsed.searchParams.set('tag', amazonTag);
        return parsed.toString();
      } catch (e) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}tag=${amazonTag}`;
      }
    }

    // 2. Mercado Livre (fallback para matt_tool se não for meli.la gerado previamente)
    if (isMeli && !url.includes('meli.la')) {
      const mlTag = env.mlAffiliateTag || 'bv20260330080614';
      if (!url.includes('matt_tool')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}matt_tool=${mlTag}`;
      }
    }

    // 3. Shopee
    if (isShopee && !url.includes('shope.ee')) {
      const shopeeTag = env.shopeeAffiliateTag;
      if (shopeeTag && !url.includes('affiliate_id')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}affiliate_id=${shopeeTag}`;
      }
    }

    return url;
  }

  /**
   * Formata valores em Reais (BRL)
   */
  formatBrl(value) {
    if (value === null || value === undefined || isNaN(value)) return '0,00';
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Extrai e calcula valores à vista, parcelado, desconto e destaques
   */
  extractFinancialDetails(product) {
    const price = Number(product.price) || 0;
    const oldPrice = Number(product.old_price || product.oldPrice) || 0;
    
    // Cálculo do desconto real
    let discountPercent = product.discount_percent || product.discountPercent;
    if (!discountPercent && oldPrice > price && price > 0) {
      discountPercent = Math.round(((oldPrice - price) / oldPrice) * 100);
    }

    // Cálculo estimado de desconto à vista no PIX (5% a 10% quando padrão)
    const pixDiscount = product.pixDiscountPercent || (product.isCashDiscount ? 8 : 0);
    const cashPrice = pixDiscount > 0 ? price * (1 - pixDiscount / 100) : price;

    // Cálculo de parcelamento (10x sem juros padrão ou informado)
    const installmentsCount = product.installmentsCount || 10;
    const installmentValue = price > 0 ? (price / installmentsCount) : 0;

    const hasFreeShipping = Boolean(
      product.freeShipping ||
      product.free_shipping ||
      (product.shipping && product.shipping.free) ||
      price >= 79 // Padrão Mercado Livre / E-commerce para frete grátis em muitas categorias
    );

    return {
      price,
      oldPrice,
      discountPercent: discountPercent > 0 ? discountPercent : null,
      cashPrice,
      hasPixDiscount: pixDiscount > 0,
      installmentsCount,
      installmentValue,
      hasFreeShipping,
      coupon: product.coupon ? String(product.coupon).trim().toUpperCase() : null
    };
  }

  /**
   * Determina o emoji e chamada ideal de acordo com o nicho de produto
   */
  getHeadlineWithEmoji(productTitle) {
    const formatterService = require('./formatter.service');
    const headline = formatterService.generateHeadline(productTitle);
    const t = (productTitle || '').toLowerCase();

    let emoji = '🔥';
    if (/placa de v[ií]deo|rtx|gtx|radeon|rx \d{4}/.test(t)) emoji = '🎮';
    else if (/monitor/.test(t)) emoji = '🖥️';
    else if (/teclado/.test(t)) emoji = '⌨️';
    else if (/mouse/.test(t)) emoji = '🖱️';
    else if (/headset|fone|audio/.test(t)) emoji = '🎧';
    else if (/processador|ryzen|core i[3579]/.test(t)) emoji = '⚡';
    else if (/ssd|nvme|mem[oó]ria ram/.test(t)) emoji = '🚀';
    else if (/gabinete|fonte|cooler|water/.test(t)) emoji = '💻';
    else if (/cadeira|mesa/.test(t)) emoji = '🪑';

    return { emoji, headline };
  }

  /**
   * Resolve o link de afiliado priorizando o formato oficial (meli.la, shope.ee, amzn.to)
   */
  async resolveAffiliateLink(product, customLink = null) {
    const rawLink = customLink || product?.link || '';
    if (!rawLink || typeof rawLink !== 'string') return '';

    // Se já é um link curto oficial, usa diretamente sem re-encurtar
    if (/meli\.la|shope\.ee|amzn\.to/i.test(rawLink)) {
      return rawLink.trim();
    }

    // Se é link do Mercado Livre ou Shopee não-encurtado, tenta gerar via FormatterService oficial
    const isMeli = rawLink.includes('mercadolivre.com') || rawLink.includes('mercadolibre.com');
    const isShopee = rawLink.includes('shopee.com') || rawLink.includes('shope.ee');

    if (isMeli || isShopee) {
      try {
        const formatterService = require('./formatter.service');
        const formatted = await formatterService.formatLink(rawLink);
        if (formatted && (formatted.includes('meli.la') || formatted.includes('shope.ee'))) {
          return formatted;
        }
      } catch (err) {
        logger.debug(`[GamerCopywriter] Erro ao obter link oficial via formatterService: ${err.message}`);
      }
    }

    // Fallback: anexa a tag e tenta encurtador limpo
    const taggedLink = this.applyAffiliateTag(rawLink);
    return await this.shortenUrl(taggedLink);
  }

  /**
   * Gera o Copywriting para WHATSAPP (Markdown compatível com WhatsApp)
   * Formato limpo, direto e de alta conversão:
   * 1. Categoria/Destaque direto
   * 2. Nome do produto
   * 3. Preço (De / Por / PIX / Parcelas)
   * 4. Cupom e Frete Grátis
   * 5. Link direto
   * 
   * @param {Object} product Objeto completo do produto
   * @param {string} [customLink=null] Link de afiliado opcional pré-resolvido
   * @returns {Promise<string>} Mensagem formatada para WhatsApp
   */
  async formatForWhatsApp(product, customLink = null) {
    if (!product.coupon && !product.couponDetails) {
      try {
        const couponFetcher = require('./couponFetcher.service');
        await couponFetcher.resolveCouponForProduct(product);
      } catch (e) {
        logger.debug(`[GamerCopywriter] Erro ao resolver cupom: ${e.message}`);
      }
    }

    const shortLink = await this.resolveAffiliateLink(product, customLink);

    const finance = this.extractFinancialDetails(product);
    const { emoji, headline } = this.getHeadlineWithEmoji(product.title);

    const lines = [];

    // 1. Header limpo e dinâmico
    lines.push(`${emoji} *${headline}*`);
    lines.push('');

    // 2. Título do produto (limpo)
    lines.push(product.title.trim());
    lines.push('');

    // 3. Preços
    if (finance.oldPrice > finance.price) {
      lines.push(`De: ~R$ ${this.formatBrl(finance.oldPrice)}~`);
    }

    if (finance.hasPixDiscount) {
      lines.push(`🔥 Por: *R$ ${this.formatBrl(finance.cashPrice)}* à vista no PIX`);
      if (finance.price >= 100) {
        lines.push(`💳 ou R$ ${this.formatBrl(finance.price)} em até *${finance.installmentsCount}x de R$ ${this.formatBrl(finance.installmentValue)}*`);
      }
    } else {
      lines.push(`💸 Por: *R$ ${this.formatBrl(finance.price)}*`);
      if (finance.price >= 150) {
        lines.push(`💳 Em até *${finance.installmentsCount}x de R$ ${this.formatBrl(finance.installmentValue)}* sem juros`);
      }
    }

    // 4. Benefícios rápidos
    if (finance.coupon) {
      let desc = '';
      if (product.couponDetails?.description) {
        desc = ` (${product.couponDetails.description.trim()})`;
      }
      lines.push(`🎟️ Cupom diário: *${finance.coupon}*${desc}`);
    }
    if (finance.hasFreeShipping) {
      lines.push('🚚 Frete Grátis');
    }

    lines.push('');
    // 5. Link de compra
    lines.push(`🛒 Compre aqui: ${shortLink}`);

    // Aviso de limite de resgate apenas se houver cupom
    if (finance.coupon) {
      lines.push('⚠️ *Cupons possuem limite de resgate.*');
    }

    return lines.join('\n');
  }

  /**
   * Gera o Copywriting para TELEGRAM (HTML seguro que evita erros de MarkdownV2)
   * 
   * @param {Object} product Objeto completo do produto
   * @param {string} [customLink=null] Link de afiliado opcional pré-resolvido
   * @returns {Promise<string>} Mensagem formatada em HTML para Telegram
   */
  async formatForTelegram(product, customLink = null) {
    if (!product.coupon && !product.couponDetails) {
      try {
        const couponFetcher = require('./couponFetcher.service');
        await couponFetcher.resolveCouponForProduct(product);
      } catch (e) {
        logger.debug(`[GamerCopywriter] Erro ao resolver cupom: ${e.message}`);
      }
    }

    const shortLink = await this.resolveAffiliateLink(product, customLink);

    const finance = this.extractFinancialDetails(product);
    const { emoji, headline } = this.getHeadlineWithEmoji(product.title);

    const escapeHtml = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    const lines = [];

    // Header dinâmico com HTML
    lines.push(`${emoji} <b>${escapeHtml(headline)}</b>`);
    lines.push('');

    // Título
    lines.push(`<b>${escapeHtml(product.title.trim())}</b>`);
    lines.push('');

    // Preços
    if (finance.oldPrice > finance.price) {
      lines.push(`De: <s>R$ ${this.formatBrl(finance.oldPrice)}</s>`);
    }

    if (finance.hasPixDiscount) {
      lines.push(`🔥 Por: <b>R$ ${this.formatBrl(finance.cashPrice)}</b> à vista no PIX`);
      if (finance.price >= 100) {
        lines.push(`💳 ou R$ ${this.formatBrl(finance.price)} em até <b>${finance.installmentsCount}x de R$ ${this.formatBrl(finance.installmentValue)}</b>`);
      }
    } else {
      lines.push(`💸 Por: <b>R$ ${this.formatBrl(finance.price)}</b>`);
      if (finance.price >= 150) {
        lines.push(`💳 Em até <b>${finance.installmentsCount}x de R$ ${this.formatBrl(finance.installmentValue)}</b> sem juros`);
      }
    }

    if (finance.coupon) {
      let desc = '';
      if (product.couponDetails?.description) {
        desc = ` (${escapeHtml(product.couponDetails.description.trim())})`;
      }
      lines.push(`🎟️ Cupom diário: <code>${escapeHtml(finance.coupon)}</code>${desc}`);
    }
    if (finance.hasFreeShipping) {
      lines.push('🚚 Frete Grátis');
    }

    lines.push('');
    lines.push(`🛒 <a href="${shortLink}"><b>Compre aqui</b></a>`);

    if (finance.coupon) {
      lines.push('⚠️ <i>Cupons possuem limite de resgate.</i>');
    }

    return lines.join('\n');
  }
}

module.exports = new GamerCopywriterService();
