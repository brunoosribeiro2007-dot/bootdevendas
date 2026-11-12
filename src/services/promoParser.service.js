/**
 * ==============================================================================
 * PROMO PARSER SERVICE - EXTRATOR E LISTENER DE PROMOÇÕES / CUPONS
 * ==============================================================================
 * Responsabilidades:
 * 1. Extrair links do Mercado Livre (meli.la, mercadolivre.com.br, etc.) via Regex.
 * 2. Resolver links encurtados (unshorten de meli.la) para obter a URL limpa final.
 * 3. Extrair códigos de cupom de textos promocionais livres ou concorrentes.
 * 4. Fazer scraping da página do produto para capturar Título, Preço e Imagem HD.
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

class PromoParserService {
  constructor() {
    // Regex para URLs do Mercado Livre (suporta links curtos e canônicos)
    this.meliUrlRegex = /https?:\/\/(?:(?:www\.)?(?:produto\.)?mercadolivre\.com\.br\/[^\s<>"')]+|meli\.la\/[a-zA-Z0-9_-]+|mercadolivre\.com\/sec\/[a-zA-Z0-9_-]+)/gi;

    // Regex para extração de cupons de desconto em textos livres
    this.couponRegex = /(?:cupom|use\s+o\s+cupom|c[oó]digo|c[oó]d\.?|🎟️|🏷️)\s*[:=-]?\s*[*_`"']?\s*([A-Z0-9_-]{3,25})\b/i;

    // Termos que não devem ser confundidos com códigos de cupom
    this.invalidCouponTerms = new Set([
      'OFF', 'DESCONTO', 'DESCONTOS', 'FRETE', 'GRATIS', 'GRÁTIS', 'REAIS', 'PRODUTO', 'PRODUTOS',
      'OFERTA', 'OFERTAS', 'CONFIRA', 'ACESSE', 'LINK', 'AQUI', 'LIMITADO', 'ESGOTANDO',
      'COM', 'SEM', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'EM', 'NO', 'NA', 'NOS', 'NAS',
      'POR', 'PARA', 'PRA', 'PRO', 'PELO', 'PELA', 'ATE', 'ATÉ', 'MAIS', 'MENOS', 'QUE',
      'SEU', 'SUA', 'TODO', 'TODA', 'TUDO', 'NADA', 'QUALQUER', 'APENAS', 'SOMENTE',
      'VALE', 'LEVE', 'PAGUE', 'GANHE', 'LOJA', 'OFICIAL', 'NOVO', 'NOVA', 'ESPECIAL'
    ]);
  }

  /**
   * Extrai todos os links do Mercado Livre presentes em um texto bruto.
   * @param {string} text - Texto promocional recebido.
   * @returns {string[]} Lista de links encontrados.
   */
  extractMeliUrls(text) {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(this.meliUrlRegex) || [];
    return [...new Set(matches)]; // Remove duplicados
  }

  /**
   * Resolve redirecionamentos de links curtos (ex: meli.la/xxx) obtendo a URL canônica real.
   * @param {string} shortUrl - Link encurtado ou original.
   * @returns {Promise<string>} URL de destino limpa.
   */
  async unshortenUrl(shortUrl) {
    if (!shortUrl) return '';

    // Se não for link encurtado meli.la ou redirect sec, apenas limpa parâmetros de rastreamento
    if (!shortUrl.includes('meli.la') && !shortUrl.includes('/sec/')) {
      return this.cleanProductUrl(shortUrl);
    }

    try {
      logger.info(`[PromoParser] Resolvendo redirecionamento para: ${shortUrl}`);
      const res = await axios.get(shortUrl, {
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 400
      });

      // Captura a URL final pós-redirecionamento
      let finalUrl = res.request?.res?.responseUrl || res.config?.url || shortUrl;

      // Se a página retornou um meta refresh ou javascript redirect
      if (res.data && typeof res.data === 'string') {
        const metaRefresh = res.data.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
        if (metaRefresh && metaRefresh[1]) {
          finalUrl = metaRefresh[1];
        }
      }

      logger.info(`[PromoParser] URL final descurtada: ${finalUrl}`);
      return this.cleanProductUrl(finalUrl);
    } catch (error) {
      logger.warn(`[PromoParser] Falha ao descurtar ${shortUrl}: ${error.message}. Mantendo URL original.`);
      return this.cleanProductUrl(shortUrl);
    }
  }

  /**
   * Remove parâmetros de rastreamento de afiliados concorrentes (tracking, matt_tool, etc.)
   * @param {string} url - URL do produto.
   * @returns {string} URL limpa do produto.
   */
  cleanProductUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const urlObj = new URL(url);
      // Remove query parameters mantendo apenas o path canônico do produto
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) {
      return url.split('?')[0].split('#')[0];
    }
  }

  /**
   * Extrai código digitável de cupom presente no texto.
   * @param {string} text - Texto promocional.
   * @returns {string|null} Código do cupom em maiúsculas ou null.
   */
  extractCouponCode(text) {
    if (!text || typeof text !== 'string') return null;

    try {
      const couponFetcher = require('./couponFetcher.service');
      if (couponFetcher && typeof couponFetcher.extractCouponCode === 'function') {
        return couponFetcher.extractCouponCode(text);
      }
    } catch (e) {}

    const match = text.match(this.couponRegex);
    if (!match || !match[1]) return null;

    const code = match[1].trim().toUpperCase();

    // Validações de sanidade
    if (this.invalidCouponTerms.has(code)) return null;
    if (code.length < 3 || code.length > 25) return null;
    if (!/^[A-Z0-9_-]+$/.test(code)) return null;
    if (!/\d/.test(code) && code.length < 4) return null;

    return code;
  }

  /**
   * Faz o scraping da página do Mercado Livre e extrai Título, Imagem em Alta Resolução e Preço.
   * @param {string} productUrl - URL canônica do produto.
   * @returns {Promise<{ title: string, price: number, imageUrl: string, cleanUrl: string }>}
   */
  async scrapeProductData(productUrl) {
    try {
      logger.info(`[PromoParser] Fazendo scraping do produto: ${productUrl}`);
      const res = await axios.get(productUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 12000
      });

      const html = res.data;
      const $ = cheerio.load(html);

      // ─── 1. TÍTULO LIMPO ──────────────────────────────────────────────────
      let title = $('meta[property="og:title"]').attr('content') ||
                  $('meta[name="twitter:title"]').attr('content') ||
                  $('h1.ui-pdp-title').text().trim() ||
                  $('title').text().trim();

      // Remove sufixos comuns do Mercado Livre como "| Mercado Livre"
      if (title) {
        title = title.replace(/\s*\|\s*Mercado\s*Livre.*$/i, '').trim();
      }

      // ─── 2. IMAGEM EM ALTA RESOLUÇÃO ──────────────────────────────────────
      let imageUrl = $('meta[property="og:image"]').attr('content') ||
                     $('meta[name="twitter:image"]').attr('content') ||
                     $('img.ui-pdp-image').attr('src') ||
                     $('img.ui-pdp-gallery__figure__image').attr('src');

      if (imageUrl) {
        // Converte thumbnail para imagem original em alta resolução no CDN do ML
        imageUrl = imageUrl.replace(/-[FV]\.webp/i, '-O.webp');
        if (!imageUrl.startsWith('http')) {
          imageUrl = 'https:' + imageUrl;
        }
      }

      // ─── 3. PREÇO ATUAL ───────────────────────────────────────────────────
      let price = null;

      // Seletor principal de preço à vista / promocional do Mercado Livre
      const fractionText = $('.ui-pdp-price__second-line .andes-money-amount__fraction').first().text().replace(/\./g, '').trim();
      const centsText = $('.ui-pdp-price__second-line .andes-money-amount__cents').first().text().trim();

      if (fractionText) {
        const fullPriceStr = centsText ? `${fractionText}.${centsText}` : fractionText;
        price = parseFloat(fullPriceStr);
      }

      // Fallback 1: meta itemprop price
      if (!price || isNaN(price)) {
        const metaPrice = $('meta[itemprop="price"]').attr('content') ||
                          $('meta[property="product:price:amount"]').attr('content');
        if (metaPrice) {
          price = parseFloat(metaPrice);
        }
      }

      // Fallback 2: Regex procurando estrutura JSON na página
      if (!price || isNaN(price)) {
        const jsonMatch = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/) ||
                          html.match(/"priceAmount"\s*:\s*(\d+(?:\.\d+)?)/);
        if (jsonMatch && jsonMatch[1]) {
          price = parseFloat(jsonMatch[1]);
        }
      }

      // ─── 4. PREÇO ANTIGO (ORIGINAL) ────────────────────────────────────
      let oldPrice = null;

      // Seletor do preço riscado (primeira linha de preço) do Mercado Livre
      const oldFractionText = $('.ui-pdp-price__second-line .andes-money-amount--previous .andes-money-amount__fraction, .ui-pdp-price__original-value .andes-money-amount__fraction').first().text().replace(/\./g, '').trim();
      const oldCentsText = $('.ui-pdp-price__second-line .andes-money-amount--previous .andes-money-amount__cents, .ui-pdp-price__original-value .andes-money-amount__cents').first().text().trim();

      if (oldFractionText) {
        const fullOldPriceStr = oldCentsText ? `${oldFractionText}.${oldCentsText}` : oldFractionText;
        oldPrice = parseFloat(fullOldPriceStr);
      }

      // Fallback: Regex procurando original_price na estrutura JSON da página
      if (!oldPrice || isNaN(oldPrice)) {
        const oldPriceMatch = html.match(/"original_price"\s*:\s*(\d+(?:\.\d+)?)/);
        if (oldPriceMatch && oldPriceMatch[1]) {
          oldPrice = parseFloat(oldPriceMatch[1]);
        }
      }

      // Calcula percentual de desconto
      let discountPercent = null;
      const finalPrice = (price && !isNaN(price)) ? price : 0;
      if (oldPrice && !isNaN(oldPrice) && finalPrice > 0 && oldPrice > finalPrice) {
        discountPercent = Math.round(((oldPrice - finalPrice) / oldPrice) * 100);
      }

      return {
        title: title || 'Produto Mercado Livre',
        price: finalPrice,
        oldPrice: (oldPrice && !isNaN(oldPrice)) ? oldPrice : null,
        discountPercent: discountPercent,
        imageUrl: imageUrl || '',
        cleanUrl: this.cleanProductUrl(productUrl)
      };

    } catch (error) {
      logger.error(`[PromoParser] Erro ao raspar dados do produto: ${error.message}`);
      return {
        title: 'Produto Mercado Livre',
        price: 0,
        imageUrl: '',
        cleanUrl: this.cleanProductUrl(productUrl)
      };
    }
  }

  /**
   * Fluxo completo: extrai link, cupom, descurta e busca dados em alta resolução.
   * @param {string} text - Texto promocional recebido de canais concorrentes ou input.
   * @returns {Promise<{ found: boolean, product?: Object, coupon?: string|null, originalUrl?: string }>}
   */
  async parsePromotion(text) {
    if (!text || typeof text !== 'string') {
      return { found: false, error: 'Texto promocional vazio ou inválido.' };
    }

    const urls = this.extractMeliUrls(text);
    if (urls.length === 0) {
      return { found: false, error: 'Nenhum link do Mercado Livre encontrado no texto.' };
    }

    const originalUrl = urls[0];
    const detectedCoupon = this.extractCouponCode(text);

    // Descurta caso seja meli.la
    const cleanUrl = await this.unshortenUrl(originalUrl);

    // Scrape para obter imagem HD, título oficial e preço
    const productData = await this.scrapeProductData(cleanUrl);

    return {
      found: true,
      originalUrl,
      cleanUrl,
      coupon: detectedCoupon,
      product: {
        title: productData.title,
        price: productData.price,
        imageUrl: productData.imageUrl,
        cleanUrl: productData.cleanUrl,
        coupon: detectedCoupon,
        rawText: text
      }
    };
  }
}

module.exports = new PromoParserService();
