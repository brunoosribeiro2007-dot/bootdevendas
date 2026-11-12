/**
 * ==============================================================================
 * DEAL MINER SERVICE (src/services/dealMiner.service.js)
 * ==============================================================================
 * Módulo de garimpo e extração de promoções de alta conversão:
 * 1. Mercado Livre: Busca ofertas com desconto real >= 15%, anti-duplicação diária
 *    em memória e conversão para links de afiliado com tags matt_tool / matt_word.
 * 2. Amazon: Extrator leve via scraping (sem PA-API 5.0), suporte a links curtos
 *    (amzn.to / a.co), extração de ASIN e tags de afiliado.
 * 3. Ciclo de Garimpo Integrado: orquestra busca via IA + captura + formatação.
 * ==============================================================================
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');
const env = require('../config/env');
const { formatarOfertaComIA, gerarBuscasComIA } = require('./geminiAi.service');
const { isDeceptiveAccessory } = require('../helpers/accessoryDetector');

// ──────────────────────────────────────────────────────────────────────────────
// CONTROLE DE DUPLICAÇÃO DIÁRIA EM MEMÓRIA (SET)
// ──────────────────────────────────────────────────────────────────────────────
const sentProductIds = new Set();
let lastResetDate = new Date().toISOString().slice(0, 10);

/**
 * Reseta o conjunto de produtos enviados caso tenha virado o dia.
 */
function checkAndResetDailySet() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    logger.info(`[DealMiner] 📅 Mudança de dia detectada (${lastResetDate} -> ${today}). Limpando Set em memória.`);
    sentProductIds.clear();
    lastResetDate = today;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. GARIMPADOR MERCADO LIVRE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Aplica parâmetros de afiliado matt_tool e matt_word no link do Mercado Livre.
 * @param {string} rawUrl 
 * @returns {string} URL com parâmetros de afiliado
 */
function applyMlAffiliateParams(rawUrl) {
  if (!rawUrl) return '';
  const mattTool = process.env.ML_MATT_TOOL || process.env.ML_AFFILIATE_TAG || env.mlAffiliateTag || 'bv20260330080614';
  const mattWord = process.env.ML_MATT_WORD || '';

  try {
    const parsed = new URL(rawUrl);
    if (mattTool) parsed.searchParams.set('matt_tool', mattTool);
    if (mattWord) parsed.searchParams.set('matt_word', mattWord);
    return parsed.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    let res = `${rawUrl}${sep}matt_tool=${encodeURIComponent(mattTool)}`;
    if (mattWord) res += `&matt_word=${encodeURIComponent(mattWord)}`;
    return res;
  }
}

/**
 * Converte thumbnail de baixa/média resolução (-I) para alta resolução (-O).
 * @param {string} url 
 * @returns {string} URL em alta resolução
 */
function convertToHighResImage(url) {
  if (!url) return '';
  return url
    .replace(/-I\.(jpg|jpeg|webp)/i, '-O.$1')
    .replace('http://', 'https://');
}

/**
 * Busca a melhor oferta ativa no Mercado Livre para um termo específico.
 * Filtra produtos com desconto real >= 15%, sem repetir ofertas do dia.
 * 
 * @param {string} termo - Termo de busca (ex: "Ryzen 7 5700X")
 * @returns {Promise<object|null>} Dados da melhor oferta encontrada ou null
 */
async function buscarMelhorOfertaML(termo) {
  checkAndResetDailySet();

  const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&condition=new&limit=15`;
  const token = process.env.ML_ACCESS_TOKEN || env.mlAccessToken;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await axios.get(searchUrl, {
      headers,
      timeout: 10000
    });

    const results = Array.isArray(response.data?.results) ? response.data.results : [];
    if (results.length === 0) {
      logger.debug(`[DealMiner] Nenhum resultado retornado para o termo "${termo}".`);
      return null;
    }

    // Filtra produtos válidos:
    // 1. Não enviado hoje
    // 2. Preço original maior que preço atual (desconto real)
    // 3. Desconto real de pelo menos 15%
    // 4. Bloqueia acessórios enganosos (ex: suportes de plástico fingindo ser console)
    const ofertasValidas = results.filter(item => {
      if (!item || !item.id || sentProductIds.has(item.id)) return false;
      if (!item.original_price || !item.price || item.original_price <= item.price) return false;

      const discountRatio = (item.original_price - item.price) / item.original_price;
      if (discountRatio < 0.15) return false;

      // Trava de acessório enganoso
      if (isDeceptiveAccessory({ title: item.title, price: item.price })) {
        logger.debug(`[DealMiner] Acessório enganoso descartado: "${item.title}"`);
        return false;
      }

      return true;
    });

    if (ofertasValidas.length === 0) {
      logger.debug(`[DealMiner] Nenhuma oferta com >= 15% de desconto real encontrada para "${termo}".`);
      return null;
    }

    // Ordena pelo maior percentual de desconto real
    ofertasValidas.sort((a, b) => {
      const discA = (a.original_price - a.price) / a.original_price;
      const discB = (b.original_price - b.price) / b.original_price;
      return discB - discA;
    });

    const melhor = ofertasValidas[0];
    const discountPct = Math.round(((melhor.original_price - melhor.price) / melhor.original_price) * 100);

    // Marca como enviado hoje
    sentProductIds.add(melhor.id);

    // Monta detalhes de parcelamento e frete
    const parts = [];
    const origPriceFormatted = melhor.original_price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    parts.push(`De: R$ ${origPriceFormatted} (${discountPct}% OFF)`);

    if (melhor.installments && (melhor.installments.rate === 0 || melhor.installments.rate === 0.0)) {
      const amount = melhor.installments.amount ? melhor.installments.amount.toFixed(2).replace('.', ',') : '';
      parts.push(`Em até ${melhor.installments.quantity}x de R$ ${amount} sem juros`);
    }

    if (melhor.shipping && melhor.shipping.free_shipping) {
      parts.push('Frete Grátis');
    }

    const detalhes = parts.join(' • ');
    const linkAfiliado = applyMlAffiliateParams(melhor.permalink);
    const imagemAlta = convertToHighResImage(melhor.thumbnail);

    const produtoFormatado = {
      id: melhor.id,
      titulo: melhor.title,
      preco: `R$ ${melhor.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      precoNumerico: melhor.price,
      precoAntigo: melhor.original_price,
      desconto: `${discountPct}%`,
      link: linkAfiliado,
      imagem: imagemAlta,
      detalhes
    };

    logger.info(`[DealMiner] 🎯 Melhor oferta garimpada para "${termo}": "${melhor.title}" (${discountPct}% OFF)`);
    return produtoFormatado;
  } catch (err) {
    logger.warn(`[DealMiner] ⚠️ Falha ao buscar oferta no ML para "${termo}": ${err.message}`);
    return null;
  }
}

/**
 * Executa um ciclo completo de garimpo:
 * 1. Gera 15 termos de busca via IA (ou fallback)
 * 2. Consulta o Mercado Livre para cada termo
 * 3. Formata as melhores ofertas encontradas com IA
 * 
 * @param {object} options
 * @param {string} [options.categorias] - Categorias alvo
 * @param {number} [options.limite=5] - Limite de ofertas a coletar e formatar
 * @returns {Promise<Array<{ produto: object, mensagemFormatada: string }>>}
 */
async function executarCicloDeGarimpo({ categorias, limite = 5 } = {}) {
  logger.info('[DealMiner] 🚀 Iniciando ciclo automático de garimpo...');
  const ofertasProcessadas = [];

  try {
    const termos = await gerarBuscasComIA(categorias);
    logger.info(`[DealMiner] Processando ${termos.length} termos de busca...`);

    for (const termo of termos) {
      if (ofertasProcessadas.length >= limite) break;

      const oferta = await buscarMelhorOfertaML(termo);
      if (oferta) {
        const mensagemFormatada = await formatarOfertaComIA({
          titulo: oferta.titulo,
          preco: oferta.preco,
          link: oferta.link,
          detalhes: oferta.detalhes
        });

        ofertasProcessadas.push({
          produto: oferta,
          mensagemFormatada
        });
      }
    }

    logger.info(`[DealMiner] 🏁 Ciclo de garimpo finalizado com sucesso! ${ofertasProcessadas.length} ofertas prontas.`);
  } catch (err) {
    logger.error(`[DealMiner] ❌ Erro durante o ciclo de garimpo: ${err.message}`);
  }

  return ofertasProcessadas;
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. EXTRATOR AMAZON VIA SCRAPING LEVE (SEM PA-API 5.0)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extrai dados essenciais de um produto da Amazon via scraping leve com Cheerio.
 * Suporta URLs completas da Amazon e links curtos (amzn.to, a.co).
 * 
 * @param {string} rawUrl - URL ou link encurtado da Amazon
 * @returns {Promise<{
 *   asin: string|null,
 *   titulo: string,
 *   preco: string,
 *   link: string,
 *   imagem: string,
 *   detalhes: string
 * }|null>}
 */
async function extrairProdutoAmazon(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    logger.warn('[DealMiner:Amazon] URL inválida fornecida.');
    return null;
  }

  const amazonTag = process.env.AMAZON_PARTNER_TAG || process.env.AMAZON_TAG || env.amazonPartnerTag || '';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  try {
    // 1. Faz a requisição seguindo redirecionamentos (necessário para amzn.to e a.co)
    const response = await axios.get(rawUrl, {
      headers,
      maxRedirects: 10,
      timeout: 15000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const finalUrl = response.request?.res?.responseUrl || response.config?.url || rawUrl;

    // 2. Extrai o ASIN de 10 caracteres via Regex
    const asinRegex = /(?:\/dp\/|\/gp\/product\/|\/product\/)([A-Z0-9]{10})/i;
    const match = finalUrl.match(asinRegex) || rawUrl.match(asinRegex);
    const asin = match ? match[1] : null;

    // 3. Monta o link limpo oficial com tag de afiliado
    let linkAfiliado = finalUrl;
    if (asin) {
      linkAfiliado = `https://www.amazon.com.br/dp/${asin}${amazonTag ? `?tag=${encodeURIComponent(amazonTag)}` : ''}`;
    }

    // 4. Faz o parse do HTML com Cheerio
    const $ = cheerio.load(response.data);

    // Título
    let titulo = $('#productTitle').text().trim();
    if (!titulo) {
      titulo = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    }
    // Remove "Amazon.com.br:" ou sufixos de loja do título
    titulo = titulo.replace(/^Amazon\.com\.br:\s*/i, '').replace(/:\s*Amazon\.com\.br$/i, '').trim();

    // Preço
    let preco = $('.a-price .a-offscreen').first().text().trim();
    if (!preco) {
      const whole = $('.a-price-whole').first().text().replace(/[\r\n\t]/g, '').trim();
      const fraction = $('.a-price-fraction').first().text().trim();
      if (whole) {
        preco = `R$ ${whole}${fraction ? `,${fraction}` : ''}`;
      }
    }

    // Imagem em alta resolução
    let imagem = $('#landingImage').attr('data-old-hires') ||
                 $('#landingImage').attr('src') ||
                 $('img#imgBlkFront').attr('src') ||
                 $('meta[property="og:image"]').attr('content') || '';

    // Detalhes extras (parcelamento sem juros se disponível)
    let detalhes = '';
    const installmentText = $('#installmentCalculator_feature_div').text().trim().replace(/\s+/g, ' ');
    if (installmentText && installmentText.toLowerCase().includes('sem juros')) {
      const matchJuros = installmentText.match(/(\d+x\s+de\s+R\$\s*[\d,.]+[^.]+sem juros)/i);
      detalhes = matchJuros ? matchJuros[1] : 'Parcelamento disponível';
    }

    logger.info(`[DealMiner:Amazon] ✅ Produto extraído com sucesso: "${titulo.slice(0, 50)}..." | ASIN: ${asin || 'N/A'}`);

    return {
      asin,
      titulo,
      preco: preco || 'Consulte no link',
      link: linkAfiliado,
      imagem,
      detalhes
    };
  } catch (err) {
    logger.warn(`[DealMiner:Amazon] ⚠️ Falha ao extrair produto da Amazon (${rawUrl}): ${err.message}`);
    return null;
  }
}

module.exports = {
  buscarMelhorOfertaML,
  executarCicloDeGarimpo,
  extrairProdutoAmazon,
  sentProductIds,
  applyMlAffiliateParams,
  convertToHighResImage
};
