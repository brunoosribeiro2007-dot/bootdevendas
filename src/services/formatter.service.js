/**
 * ==============================================================================
 * FORMATTER SERVICE - SERVIÇO DE FORMATAÇÃO E ENCURTAMENTO DE LINKS
 * ==============================================================================
 * Responsabilidades deste módulo:
 * 1. Gerar e validar links oficiais de afiliado (Mercado Livre e Shopee).
 * 2. Criar chamadas de alto impacto (Headlines) baseadas no título do produto.
 * 3. Formatar as mensagens promocionais para publicação no WhatsApp.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const env = require('../config/env');
const logger = require('../config/logger');
const couponFetcher = require('./couponFetcher.service');

// Serviço opcional de automação via Puppeteer para Mercado Livre
let meliUiService;
if (env.useMlAffiliateUi) {
  try {
    meliUiService = require('./meliUi.service');
  } catch (e) {
    logger.debug('meliUi.service não disponível:', e.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: HELPERS INTERNOS DE FORMATAÇÃO E VALIDAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Valida se um código de cupom possui formato textual válido.
 * Evita textos descritivos como "10% OFF" ou "FRETE GRÁTIS" serem tratados como código.
 * @param {string} coupon - Texto ou código de cupom.
 * @returns {boolean} True se for um código alfanumérico limpo (3 a 25 caracteres).
 */
const isValidCouponCode = (coupon) => {
  if (!coupon || typeof coupon !== 'string') return false;
  const clean = coupon.trim().toUpperCase();
  if (/\s|%|R\$/i.test(clean)) {
    return false;
  }
  if (/^(off|desconto|grátis|gratis)$/i.test(clean)) {
    return false;
  }
  if (couponFetcher && typeof couponFetcher.isValidRealCouponCode === 'function') {
    return couponFetcher.isValidRealCouponCode(clean);
  }
  if (!/\d/.test(clean) && clean.length < 4) return false;
  return /^[A-Z0-9_-]{3,25}$/i.test(clean);
};

/**
 * Formata valores numéricos para o padrão de moeda brasileiro.
 * Exibe números inteiros sem centavos (ex: "55") e decimais com vírgula (ex: "1999,99").
 * @param {number} value - Preço numérico.
 * @returns {string} Preço formatado.
 */
const formatPrice = (value) => {
  if (value === null || value === undefined) return '';
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2).replace('.', ',');
};

/**
 * Formata valores numéricos para o padrão monetário da Shopee (sempre 2 casas decimais).
 * @param {number} value - Preço numérico.
 * @returns {string} Preço formatado com 2 decimais (ex: "150,00").
 */
const formatShopeePrice = (value) => {
  if (value === null || value === undefined) return '';
  return value.toFixed(2).replace('.', ',');
};

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: CLASSE PRINCIPAL DE FORMATAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

class FormatterService {

  /**
   * Gera link de afiliado oficial do Mercado Livre (meli.la) chamando a API interna
   * com a sessão autenticada por cookies (.ml_cookies.json ou ML_COOKIE_STRING).
   * 
   * Fluxo:
   * 1. Lê e sanitiza cookies da sessão do Mercado Livre.
   * 2. Extrai ou busca o token CSRF obrigatório.
   * 3. Dispara POST para /affiliate-program/api/v2/affiliates/createLink.
   * 4. Retorna a URL encurtada oficial (ex: https://meli.la/...).
   * 
   * @param {string} baseLink - Link canônico ou limpo do produto no Mercado Livre.
   * @param {string} tag - Tag de afiliado configurada.
   * @returns {Promise<string|null>} Link encurtado oficial ou null se falhar.
   */
  async formatLinkViaDirectApi(baseLink, tag) {
    let cookieHeader = null;
    const cookiesPath = env.mlCookiesPath || path.resolve(process.cwd(), '.ml_cookies.json');

    if (fs.existsSync(cookiesPath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } catch (e) {
        logger.warn('Falha ao ler cookies do arquivo .ml_cookies.json');
      }
    }

    if (!cookieHeader) {
      cookieHeader = env.mlCookieString;
    }

    if (!cookieHeader) {
      logger.debug('Nenhum cookie configurado para API direta de afiliados.');
      return null;
    }

    // Sanitiza cookie removendo caracteres inválidos para headers HTTP (ASCII 0x20-0x7E)
    cookieHeader = cookieHeader.replace(/[^\x20-\x7E]/g, '').trim();

    try {
      // 0. Tenta extrair CSRF direto da string de cookies (evita GET redundante)
      let csrfFromCookie = null;
      const csrfCookieMatch = cookieHeader.match(/_csrf=([^;\s]+)/);
      if (csrfCookieMatch) {
        csrfFromCookie = csrfCookieMatch[1];
        logger.info(`CSRF extraído do cookie: ${csrfFromCookie.substring(0, 10)}...`);
      }

      // 1. Obtém token CSRF consultando o portal de afiliados caso necessário
      logger.info('Buscando token CSRF na página do programa de afiliados...');
      const portalRes = await axios.get('https://www.mercadolivre.com.br/l/afiliados-home', {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        },
        timeout: 8000
      });

      const html = portalRes.data;
      const $ = cheerio.load(html);

      let csrfToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val();
      if (!csrfToken) {
        const csrfMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/) ||
                          html.match(/"csrf"\s*:\s*"([^"]+)"/) ||
                          html.match(/csrf-token"\s*content="([^"]+)"/);
        if (csrfMatch) csrfToken = csrfMatch[1];
      }

      // Concatena novos cookies retornados pelo portal
      let currentCookieHeader = cookieHeader;
      if (portalRes.headers['set-cookie']) {
        const newCookies = portalRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        currentCookieHeader = `${cookieHeader}; ${newCookies}`;
      }

      logger.info(`CSRF Token encontrado: ${csrfToken ? 'SIM' : 'NÃO'}`);

      // 2. Dispara a chamada POST para gerar o link oficial encurtado
      const apiUrl = env.mlAffiliateApiUrl || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
      const payload = { urls: [baseLink], tag };
      const headers = {
        'Cookie': currentCookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.mercadolivre.com.br',
        'Referer': 'https://www.mercadolivre.com.br/l/afiliados-home'
      };

      const finalCsrf = csrfToken || csrfFromCookie;
      if (finalCsrf) {
        headers['x-csrf-token'] = finalCsrf;
      }

      logger.info('Enviando requisição POST para a API de afiliados do ML...');
      const apiRes = await axios.post(apiUrl, payload, { headers, timeout: 8000 });

      // 3. Extrai o link encurtado do payload de resposta
      if (apiRes.data) {
        if (apiRes.data.urls && apiRes.data.urls[0]) {
          const itemRes = apiRes.data.urls[0];
          if (itemRes.short_url) {
            logger.info(`✅ API Direta ML: Link encurtado gerado: ${itemRes.short_url}`);
            return itemRes.short_url;
          }
        }

        const dataStr = JSON.stringify(apiRes.data);
        const match = dataStr.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
        if (match) {
          logger.info(`✅ API Direta ML: Link encurtado encontrado via Regex: ${match[0]}`);
          return match[0];
        }
      }
    } catch (e) {
      logger.warn(`⚠️ Falha na geração de link direto via API: ${e.message}`);
      if (e.response && e.response.data) {
        logger.warn(`Detalhes do erro da API: ${JSON.stringify(e.response.data)}`);
      }
    }
    return null;
  }

  /**
   * Gera link de afiliado oficial encurtado da Shopee (shope.ee) via GraphQL API.
   * Utiliza assinatura criptográfica HMAC-SHA256 padrão da Open API da Shopee.
   * 
   * @param {string} link - Link original do produto na Shopee.
   * @returns {Promise<string|null>} Link encurtado shope.ee ou null em caso de falha.
   */
  async formatShopeeLinkViaApi(link) {
    const appId = env.shopeeAppId;
    const secret = env.shopeeSecret;
    if (!appId || !secret) return null;

    const query = `
      mutation generateShortLink($url: String!) {
        generateShortLink(input: { originUrl: $url }) {
          shortLink
        }
      }
    `;
    const variables = { url: link };
    const payloadStr = JSON.stringify({ query, variables });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Assinatura: SHA256(appId + timestamp + payload + secret)
    const baseString = appId + timestamp + payloadStr + secret;
    const signature = crypto.createHash('sha256').update(baseString).digest('hex');

    const url = 'https://open-api.affiliate.shopee.com.br/graphql';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
    };

    try {
      const res = await axios.post(url, payloadStr, { headers, timeout: 8000 });
      if (res.data && res.data.errors) {
        logger.error('Erro ao gerar shortlink Shopee:', JSON.stringify(res.data.errors));
        return null;
      }
      const shortLink = res.data?.data?.generateShortLink?.shortLink;
      if (shortLink) {
        logger.info(`✅ Shopee Link gerado com sucesso: ${shortLink}`);
        return shortLink;
      }
    } catch (e) {
      logger.warn(`Falha ao gerar link Shopee via API: ${e.message}`);
    }
    return null;
  }

  /**
   * Roteador e formatador central de links.
   * Identifica a plataforma (Shopee vs Mercado Livre) e executa as estratégias em cascata.
   * 
   * @param {string} link - URL original do produto.
   * @returns {Promise<string>} Link final formatado/encurtado.
   */
  async formatLink(link) {
    if (!link) return '';

    // ─── 1. Rota Shopee ────────────────────────────────────────────────────────
    const isShopee = link.includes('shopee.com.br') || link.includes('shope.ee');
    if (isShopee) {
      const apiLink = await this.formatShopeeLinkViaApi(link);
      if (apiLink) return apiLink;

      // Fallback Shopee: Parâmetros UTM oficiais com a tag de afiliado
      const baseLink = link.split('?')[0].split('#')[0];
      const trackingParam = env.shopeeAffiliateTag
        ? `?utm_campaign=-&utm_content=-&utm_medium=affiliates&utm_source=an_spp&utm_term=${env.shopeeAffiliateTag}`
        : '';
      return `${baseLink}${trackingParam}`;
    }

    // ─── 2. Rota Mercado Livre ─────────────────────────────────────────────────
    const tag = env.mlAffiliateTag || 'bv20260330080614';
    const baseLink = link.split('?')[0].split('#')[0];

    // Estratégia A: API Direta com cookies (mais rápida, autônoma e oficial meli.la)
    if (process.env.NODE_ENV !== 'test') {
      const directShortLink = await this.formatLinkViaDirectApi(baseLink, tag);
      if (directShortLink) return directShortLink;
    }

    // Estratégia B: Automação Puppeteer (caso ativada)
    if (env.useMlAffiliateUi && meliUiService && process.env.NODE_ENV !== 'test') {
      try {
        const short = await meliUiService.generateShortLink(baseLink, tag, 60000);
        if (short && short.includes('meli.la')) return short;
      } catch (e) {
        logger.warn('Geração de shortlink ML via Puppeteer falhou:', e.message);
      }
    }

    // Estratégia C: Tentativa de API de afiliado via URL configurada (se ativada)
    if (env.useMlAffiliateApi && process.env.NODE_ENV !== 'test') {
      const apiUrl = env.mlAffiliateApiUrl || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
      try {
        const res = await axios.post(apiUrl, { source: baseLink, tag }, { timeout: 5000 });
        if (res.data && typeof res.data === 'object') {
          const strData = JSON.stringify(res.data);
          const meliMatch = strData.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
          if (meliMatch) return meliMatch[0];
        }
      } catch (e) {
        logger.debug(`Falha ao chamar apiUrl customizada: ${e.message}`);
      }
    }

    // Estratégia D: Fallback oficial do Mercado Livre com parâmetro matt_tool
    const longAffiliateLink = `${baseLink}?matt_tool=${tag}`;
    logger.warn('⚠️ FALLBACK: Retornando link oficial do Mercado Livre com tag de afiliado.');
    return longAffiliateLink;
  }

  /**
   * Gera mensagem em formato bruto (raw), usada em testes, auditorias e chamadas simplificadas.
   * @param {Object} product - Dados do produto.
   * @param {string|null} finalLink - Link já formatado (opcional).
   * @returns {Promise<string>} Mensagem de texto simples.
   */
  async generateRawMessage(product, finalLink = null) {
    const link = finalLink || await this.formatLink(product.link);
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${link}`;
  }

  /**
   * Analisa o título do produto e gera uma chamada (Headline) atrativa em MAIÚSCULAS
   * categorizada de acordo com o nicho do item (Eletrodomésticos, Casa, Cozinha, etc.).
   * 
   * @param {string} productTitle - Título original do produto.
   * @returns {string} Frase de efeito promocional em maiúsculas.
   */
  // ────────────────────────────────────────────────────────────────────────────
  // LIMPEZA E SIMPLIFICAÇÃO DE TÍTULOS
  // ────────────────────────────────────────────────────────────────────────────
  cleanProductTitle(rawTitle) {
    if (!rawTitle) return '';
    let t = rawTitle;

    // Remove tags de marketing e lixo de SEO comum de marketplaces
    t = t.replace(/\b(envio imediato|pronta entrega|com nota fiscal|nota fiscal|\bnf\b|original|lacrado|lancamento|lançamento|full|novo|promocao|promoção|oferta|imperdivel|imperdível)\b/gi, '');
    t = t.replace(/\b(frete gr[aá]tis|melhor pre[cç]o|top|barato|de qualidade)\b/gi, '');
    t = t.replace(/\b(para pc gamer|pc gamer|gamer)\b/gi, '');

    // Remove redundâncias entre parênteses como (1x8gb), (2x8gb) etc.
    t = t.replace(/\(\s*\d+x\d+gb\s*\)/gi, '');
    t = t.replace(/\(\s*\d+gb\s*\)/gi, '');

    // Limpa pontuações repetidas e espaços
    t = t.replace(/[,;|+–—]+/g, ' ');
    t = t.replace(/\s{2,}/g, ' ').trim();

    // Se o título ultrapassar 60 caracteres, encurta de forma inteligente nas palavras inteiras
    if (t.length > 60) {
      const words = t.split(' ');
      let shortened = '';
      for (const w of words) {
        if ((shortened + ' ' + w).trim().length <= 60) {
          shortened = (shortened + ' ' + w).trim();
        } else {
          break;
        }
      }
      if (shortened.length >= 25) {
        t = shortened;
      }
    }

    return t;
  }

  /**
   * Identifica o produto e gera uma chamada curta, direta e de alta conversão.
   * 
   * @param {string} productTitle - Título do anúncio.
   * @returns {string} Headline concisa e vendedora em MAIÚSCULAS.
   */
  generateHeadline(productTitle) {
    if (!productTitle) return 'ACHADO IMPERDÍVEL';

    // Normaliza removendo acentos e pontuações para facilitar matching de regex
    const tNorm = productTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // ─── PC / Hardware / Periféricos / Setup Gamer ───────────────────────────
    if (/placa[- ]m[aã]e|motherboard/.test(tNorm)) return 'PLACA-MÃE EM PROMOÇÃO';
    if (/processador|ryzen|core i[3579]|intel core/.test(tNorm) && !/pasta|thermal|cooler|dissipador/.test(tNorm)) return 'PROCESSADOR EM PROMOÇÃO';
    if (/placa de v[ií]deo|placa de video|rtx|gtx|radeon|rx \d{4}/.test(tNorm) && !/suporte|cabo riser|backplate|pasta|thermal/.test(tNorm)) return 'PLACA DE VÍDEO EM PROMOÇÃO';
    if (/\b(mem[oó]ria|ram)\b/.test(tNorm) && /(ddr[345]|3200|2666|4800|5600|6000|dimm|sodimm|desktop|notebook|\d+gb)/.test(tNorm) && !/dissipador|thermal|heatsink|cooler|suporte|espelho/.test(tNorm)) return 'MEMÓRIA RAM EM PROMOÇÃO';
    if (/ssd|nvme|m\.2/.test(tNorm) && !/dissipador|thermal|heatsink|case|adaptador|gaveta/.test(tNorm)) return 'SSD NVME EM PROMOÇÃO';
    if (/fonte (atx|gamer|real|\d+w|de alimenta[çc][aã]o)|80 plus/.test(tNorm) || (/\bfonte\b/.test(tNorm) && !/água|agua|pet|gato|cão|cao|chocolate|decorat|chafariz/.test(tNorm) && /pc|watt|w\b|atx|tens[aã]o|bivolt/.test(tNorm))) {
      return 'FONTE GAMER EM PROMOÇÃO';
    }
    if (/water[- ]?cooler|air[- ]?cooler|cooler para processador/.test(tNorm)) return 'WATER COOLER EM PROMOÇÃO';
    if (/monitor gamer|monitor (144hz|240hz|165hz|75hz|60hz|ultrawide|ips|led|pc|para pc|curvo)|monitor \d{2}["'’]/.test(tNorm)) {
      return 'MONITOR GAMER EM PROMOÇÃO';
    }
    if (/teclado mec[aâ]nico|teclado mecanico|teclado gamer/.test(tNorm)) return 'TECLADO MECÂNICO EM PROMOÇÃO';
    if (/mousepad|mouse pad/.test(tNorm)) return 'MOUSEPAD GAMER EM PROMOÇÃO';
    if (/mouse gamer|mouse sem fio/.test(tNorm)) return 'MOUSE GAMER EM PROMOÇÃO';
    if (/headset|headphone gamer/.test(tNorm)) return 'HEADSET GAMER EM PROMOÇÃO';
    if (/cadeira gamer/.test(tNorm)) return 'CADEIRA GAMER EM PROMOÇÃO';
    if (/mesa gamer|escrivaninha gamer/.test(tNorm)) return 'MESA PRA SETUP EM PROMOÇÃO';
    if (/gabinete/.test(tNorm)) return 'GABINETE GAMER EM PROMOÇÃO';
    if (/notebook gamer|laptop gamer/.test(tNorm)) return 'NOTEBOOK GAMER EM PROMOÇÃO';

    // ─── Áudio de Alta Qualidade (JBL, Edifier, Soundbars) ─────────────────────
    if (/\bjbl\b/.test(tNorm) && /caixa|som|flip|charge|go\s*\d|boombox|partybox|soundbar/.test(tNorm)) {
      return 'CAIXA DE SOM JBL EM PROMOÇÃO';
    }
    if (/soundbar/.test(tNorm)) {
      return 'SOUNDBAR EM PROMOÇÃO';
    }
    if (/caixa de som bluetooth|caixa bluetooth/.test(tNorm) && !/mini|3w/.test(tNorm)) {
      return 'CAIXA DE SOM EM PROMOÇÃO';
    }

    // ─── Consoles e Controles (PS5, DualSense, Xbox) ─────────────────────────
    const isAccessory = /\b(suporte|base|porta|capa|capinha|case|silicone|skin|adesivo|grip|grips|protetor|cabo|dock|extensor|pelicula|pelicula|lente)\b/i.test(tNorm);

    if (!isAccessory) {
      if (/controle (sem fio )?(dualsense|ps5)|dualsense/.test(tNorm)) return 'CONTROLE PS5 EM PROMOÇÃO';
      if (/playstation 5|ps5|console ps5/.test(tNorm)) return 'PLAYSTATION 5 EM PROMOÇÃO';
      if (/xbox (series|one)|console xbox/.test(tNorm)) return 'CONSOLE XBOX EM PROMOÇÃO';
      if (/nintendo switch/.test(tNorm)) return 'NINTENDO SWITCH EM PROMOÇÃO';
      if (/iphone 1[456]|iphone pro/.test(tNorm)) return 'IPHONE EM PROMOÇÃO';
      if (/galaxy s2[345]|samsung s2[345]/.test(tNorm)) return 'SAMSUNG GALAXY EM PROMOÇÃO';
    } else {
      if (/suporte.*(controle|ps5|dualsense|video game|videogame)/.test(tNorm) || /porta.*controle/.test(tNorm)) return 'SUPORTE PARA CONTROLES';
      if (/suporte.*tv/.test(tNorm)) return 'SUPORTE PARA SMART TV';
    }

    // ─── Câmera de segurança e monitoramento ─────────────────────────────────
    if (/\b(filmadora|cftv)s?\b/.test(tNorm)) return 'CÂMERA DE SEGURANÇA EM PROMOÇÃO';
    if (/\bcameras?\b/.test(tNorm) && /\b(seguranca|vigilancia|monitoramento)\b/.test(tNorm)) {
      return 'CÂMERA DE SEGURANÇA EM PROMOÇÃO';
    }

    // ─── Moda e Vestuário ────────────────────────────────────────────────────
    if (/\b(trico|sueter|cardigan)s?\b/.test(tNorm)) return 'TRICO EM PROMOÇÃO';
    if (/\bcamisetas?\b|\bcamisas?\b/.test(tNorm)) return 'CAMISA EM PROMOÇÃO';
    if (/\b(tenis|sapato|sapatos|calcado|calcados)\b/.test(tNorm)) return 'TÊNIS EM PROMOÇÃO';

    // ─── Geladeiras e Refrigeração ───────────────────────────────────────────
    if (/\b(geladeira|refrigerador)s?\b/.test(tNorm)) {
      return 'GELADEIRA EM PROMOÇÃO';
    }

    // ─── Air Fryer e Fritadeiras Sem Óleo ────────────────────────────────────
    if (/\bair fryer\b/.test(tNorm) || (/\bfritadeiras?\b/.test(tNorm) && /sem oleo|eletrica/.test(tNorm))) {
      return 'AIR FRYER EM PROMOÇÃO';
    }

    // ─── Micro-ondas e Cooktops/Fogões ───────────────────────────────────────
    if (/\b(micro[- ]?ondas|microondas)\b/.test(tNorm)) return 'MICRO-ONDAS EM PROMOÇÃO';
    if (/\b(fogao|fogoes|cooktop|cooktops)\b/.test(tNorm)) return 'FOGÃO/COOKTOP EM PROMOÇÃO';

    // ─── Eletroportáteis de Cozinha ──────────────────────────────────────────
    if (/\bliquidificador(es)?\b/.test(tNorm)) return 'LIQUIDIFICADOR EM PROMOÇÃO';
    if (/\bbatedeiras?\b/.test(tNorm)) return 'BATEDEIRA EM PROMOÇÃO';
    if (/\bcafeteiras?\b/.test(tNorm)) return 'CAFETEIRA EM PROMOÇÃO';

    // ─── Purificadores e Filtros de Água (avaliado antes de panelas) ───────────
    if (/\b(purificador|purificadores|bebedouro|bebedouros)\b|\bfiltro de agua\b/.test(tNorm)) {
      return 'PURIFICADOR DE ÁGUA EM PROMOÇÃO';
    }

    // ─── Panelas e Frigideiras ───────────────────────────────────────────────
    if (/\bpanela de pressao\b/.test(tNorm)) return 'PANELA DE PRESSÃO EM PROMOÇÃO';
    if (/\bfrigideiras?\b/.test(tNorm)) return 'FRIGIDEIRA EM PROMOÇÃO';
    if (/\bpanelas?\b/.test(tNorm)) return 'JOGO DE PANELAS EM PROMOÇÃO';

    // ─── Televisores e Áudio ─────────────────────────────────────────────────
    if (/\bsmart tv\b|\btelevisao\b/.test(tNorm) || (/\btv\b/.test(tNorm) && /\d{2,3}['"]\s*(polegada|pol\b)/.test(tNorm))) {
      return 'SMART TV EM PROMOÇÃO';
    }
    if (/\b(soundbar|caixa de som)\b/.test(tNorm)) return 'SOUNDBAR EM PROMOÇÃO';

    // ─── Limpeza e Aspiradores ───────────────────────────────────────────────
    if (/\baspirador(es)?\b/.test(tNorm)) {
      if (/\brobos?\b/.test(tNorm)) return 'ASPIRADOR ROBÔ EM PROMOÇÃO';
      return 'ASPIRADOR DE PÓ EM PROMOÇÃO';
    }

    // ─── Climatização, Lavanderia e Outros Itens de Casa ─────────────────────
    if (/\bventilador(es)?\b/.test(tNorm)) return 'VENTILADOR EM PROMOÇÃO';
    if (/\bar[- ]condicionado\b/.test(tNorm)) return 'AR-CONDICIONADO EM PROMOÇÃO';
    if (/\bmaquina de lavar\b|\blava e seca\b/.test(tNorm)) return 'MÁQUINA DE LAVAR EM PROMOÇÃO';
    if (/\bferro de passar\b/.test(tNorm)) return 'FERRO DE PASSAR EM PROMOÇÃO';
    if (/\b(adega|adegas|cervejeira|cervejeiras)\b/.test(tNorm)) return 'CERVEJEIRA EM PROMOÇÃO';
    if (/\bcolchao\b|\bcolchoes\b/.test(tNorm)) return 'COLCHÃO EM PROMOÇÃO';
    if (/\b(parafusadeira|parafusadeiras|furadeira|furadeiras)\b/.test(tNorm)) return 'PARAFUSADEIRA EM PROMOÇÃO';

    // ─── Fallback inteligente: Direto e elegante ────────────────────────────
    return 'PRODUTO EM PROMOÇÃO';
  }

  /**
   * Constrói a mensagem promocional final no padrão do WhatsApp.
   * Formata os dados de acordo com a origem do produto (Shopee ou Mercado Livre):
   * 
   * Padrão Mercado Livre:
   * 1. Headline no topo
   * 2. Título original do produto
   * 3. Preço formatado (💸 Por: R$ ...)
   * 4. Cupom em destaque negrito (🎟️ Use o Cupom: *CODIGO*)
   * 5. Link oficial de compra (🛒 Compre aqui: URL)
   * 
   * @param {Object} product - Objeto com os dados do produto.
   * @param {string|null} finalLink - Link encurtado oficial (opcional).
   * @returns {Promise<string>} Mensagem formatada completa para envio.
   */
  async generateFormattedMessage(product, finalLink = null) {
    const link = finalLink || await this.formatLink(product.link);
    const currentPrice = product.price;

    const isShopee = String(product.id || '').startsWith('SP-') ||
                     (link && (link.includes('shopee') || link.includes('shope.ee')));

    // ──────────────────────────────────────────────────────────────────────────
    // FLUXO SHOPEE
    // ──────────────────────────────────────────────────────────────────────────
    if (isShopee) {
      if (product.coupon && !isValidCouponCode(product.coupon)) {
        const extracted = couponFetcher.extractCouponCode ? couponFetcher.extractCouponCode(product.coupon) : null;
        product.coupon = extracted || '';
      }

      const shopeeHeaders = [
        'ACHADO DO DIA SHOPEE 🧡',
        'PROMOÇÃO EXCLUSIVA SHOPEE 🔥',
        'SÓ HOJE NA SHOPEE ⚡',
        'OLHA ESSE PRECINHO NA SHOPEE! 👀',
        'DESCONTO ARRASADOR SHOPEE 💥',
        'SHOPEE ARRASA 🧡',
        'OFERTA IMPERDÍVEL SHOPEE 🔥',
        'PREÇO BAIXO DE VERDADE SHOPEE 💸',
        'CORRE QUE VAI ACABAR! 🏃‍♂️💨',
        'ACHADO IMPERDÍVEL SHOPEE 💎'
      ];
      const headline = shopeeHeaders[Math.floor(Math.random() * shopeeHeaders.length)];

      const lines = [];
      lines.push(headline);
      lines.push('');
      lines.push(`🛍️ ${product.title}`);
      lines.push('');

      const oldPrice = product.oldPrice !== undefined ? product.oldPrice : product.old_price;
      if (oldPrice && oldPrice > currentPrice) {
        lines.push(`De ~R$ ${formatShopeePrice(oldPrice)}~`);
      }

      lines.push(`💵 Por R$ ${formatShopeePrice(currentPrice)}`);

      let discountPercent = product.discountPercent !== undefined ? product.discountPercent : product.discount_percent;
      if (!discountPercent && oldPrice && oldPrice > currentPrice) {
        discountPercent = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
      }

      if (discountPercent && discountPercent > 0) {
        lines.push(`😱 ${discountPercent}% OFF`);
      }

      if (product.coupon) {
        let cleanCoupon = product.coupon.trim();
        if (cleanCoupon.toLowerCase().startsWith('cupom ')) {
          cleanCoupon = cleanCoupon.substring(6).trim();
        }
        if (cleanCoupon) {
          lines.push(`🎟️ Use o Cupom: *${cleanCoupon.toUpperCase()}*`);
        }
      }

      lines.push('');
      lines.push('🛒 Compre aqui:');
      lines.push(link);

      return lines.join('\n');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────
    // FLUXO MERCADO LIVRE
    // ──────────────────────────────────────────────────────────────────────────
    let resolvedCoupon = null;
    try {
      resolvedCoupon = await couponFetcher.resolveCouponForProduct(product);
    } catch (e) {
      logger.debug('[Formatter] Erro ao resolver cupom para produto:', e.message);
    }

    if (!resolvedCoupon && product.coupon) {
      const extracted = couponFetcher.extractCouponCode
        ? couponFetcher.extractCouponCode(typeof product.coupon === 'object' ? product.coupon.code : product.coupon)
        : (isValidCouponCode(product.coupon) ? product.coupon.trim().toUpperCase() : null);
      if (extracted) {
        resolvedCoupon = { code: extracted, rule: '', description: '' };
      }
    }

    // Extrai código limpo e regra do cupom
    let couponCode = null;
    let couponRule = '';

    if (resolvedCoupon) {
      if (typeof resolvedCoupon === 'object') {
        couponCode = resolvedCoupon.code ? String(resolvedCoupon.code).trim().toUpperCase() : null;
        couponRule = resolvedCoupon.rule || resolvedCoupon.description || '';
      } else if (typeof resolvedCoupon === 'string' && resolvedCoupon.trim().length > 0) {
        let clean = resolvedCoupon.trim().toUpperCase();
        if (clean.startsWith('CUPOM ')) clean = clean.substring(6).trim();
        couponCode = clean;
      }
    }

    if (couponCode && !isValidCouponCode(couponCode)) {
      couponCode = null;
      couponRule = '';
    }

    product.coupon = couponCode || '';
    const headline = this.generateHeadline(product.title);

    const lines = [];
    // 1. Título / Chamada em destaque no topo (sem negrito)
    lines.push(headline);
    lines.push('');
    // 2. Título limpo e simplificado do produto
    lines.push(this.cleanProductTitle(product.title));
    lines.push('');

    // 3. Preço antigo riscado (se houver) + Preço atual formatado
    const oldPrice = product.oldPrice !== undefined ? product.oldPrice : product.old_price;
    if (oldPrice && oldPrice > currentPrice) {
      lines.push(`De ~R$ ${formatPrice(oldPrice)}~`);
    }
    lines.push(`💰 Por apenas: R$ ${formatPrice(currentPrice)}`);

    // 3.1 Percentual de desconto (se houver)
    let discountPercent = product.discountPercent !== undefined ? product.discountPercent : product.discount_percent;
    if (!discountPercent && oldPrice && oldPrice > currentPrice) {
      discountPercent = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
    }
    if (discountPercent && discountPercent > 0) {
      lines.push(`😱 ${discountPercent}% OFF`);
    }

    // 4. Cupom diário com regra (apenas se houver cupom ativo)
    if (couponCode && couponCode.length > 0) {
      const ruleText = couponRule && couponRule.trim().length > 0 ? ` (${couponRule.trim()})` : '';
      lines.push(`🎟️ Cupom diário: *${couponCode}*${ruleText}`);
    }

    lines.push('');
    // 5. Link de compra na mesma linha
    lines.push(`🛒 Link: ${link}`);

    // 6. Aviso de resgate limitado (apenas se houver cupom diário)
    if (couponCode && couponCode.length > 0) {
      lines.push('');
      lines.push('⚠️ *Cupons possuem limite de resgate.*');
    }

    return lines.join('\n');
  }
}

module.exports = new FormatterService();
