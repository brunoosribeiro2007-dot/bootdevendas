/**
 * ==============================================================================
 * AFFILIATE CONVERTER SERVICE - CONVERSOR DE LINKS DE AFILIADO DO MERCADO LIVRE
 * ==============================================================================
 * Responsabilidades:
 * 1. Converter URLs limpas de produtos para o link de afiliado oficial meli.la.
 * 2. Executar chamadas HTTP autenticadas com os cookies da conta de afiliado (.ml_cookies.json ou ML_COOKIE_STRING).
 * 3. Suportar automação opcional via Puppeteer como segunda opção.
 * 4. Fallback seguro: caso a sessão expire, retorna a URL oficial com a tag de afiliado (matt_tool).
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const env = require('../config/env');
const logger = require('../config/logger');

let meliUiService;
if (env.useMlAffiliateUi) {
  try {
    meliUiService = require('./meliUi.service');
  } catch (e) {
    logger.debug('[AffiliateConverter] meliUi.service não disponível:', e.message);
  }
}

class AffiliateConverterService {
  constructor() {
    this.tag = env.mlAffiliateTag || 'bv20260330080614';
    this.apiUrl = env.mlAffiliateApiUrl || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
  }

  /**
   * Obtém os cookies salvos para autenticação na API do Mercado Livre.
   * @returns {string|null} String de cookies sanitizada.
   */
  getCookieHeader() {
    let cookieHeader = null;
    const cookiesPath = env.mlCookiesPath || path.resolve(process.cwd(), '.ml_cookies.json');

    if (fs.existsSync(cookiesPath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } catch (e) {
        logger.warn('[AffiliateConverter] Falha ao ler cookies de .ml_cookies.json');
      }
    }

    if (!cookieHeader) {
      cookieHeader = env.mlCookieString;
    }

    if (!cookieHeader) {
      return null;
    }

    // Sanitiza removendo caracteres fora do padrão ASCII para headers HTTP
    return cookieHeader.replace(/[^\x20-\x7E]/g, '').trim();
  }

  /**
   * Converte a URL canônica de um produto para o link oficial encurtado meli.la.
   * 
   * @param {string} rawUrl - URL limpa ou original do produto.
   * @returns {Promise<string>} Link oficial encurtado meli.la ou fallback seguro.
   */
  async convertToAffiliateLink(rawUrl) {
    if (!rawUrl) return '';

    // Remove query params e fragmentos para obter URL canônica
    const cleanUrl = rawUrl.split('?')[0].split('#')[0];
    const cookieHeader = this.getCookieHeader();

    // ─── ESTRATÉGIA 1: API DIRETA COM SESSÃO AUTENTICADA POR COOKIES ──────────
    if (cookieHeader && process.env.NODE_ENV !== 'test') {
      try {
        logger.info(`[AffiliateConverter] Convertendo URL para link de afiliado: ${cleanUrl}`);

        // 1. Extração do token CSRF do próprio cookie para evitar GET extra
        let csrfToken = null;
        const csrfMatch = cookieHeader.match(/_csrf=([^;\s]+)/);
        if (csrfMatch) {
          csrfToken = csrfMatch[1];
        }

        let currentCookies = cookieHeader;

        // Se o CSRF não estiver no cookie, faz GET rápido no portal para capturar
        if (!csrfToken) {
          try {
            const portalRes = await axios.get('https://www.mercadolivre.com.br/l/afiliados-home', {
              headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              },
              timeout: 7000
            });

            const html = portalRes.data;
            const $ = cheerio.load(html);
            csrfToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val();

            if (!csrfToken) {
              const regexMatch = html.match(/"csrfToken"\s*:\s*"([^"]+)"/) || html.match(/"csrf"\s*:\s*"([^"]+)"/);
              if (regexMatch) csrfToken = regexMatch[1];
            }

            if (portalRes.headers['set-cookie']) {
              const setCookies = portalRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
              currentCookies = `${cookieHeader}; ${setCookies}`;
            }
          } catch (portalErr) {
            logger.debug(`[AffiliateConverter] Aviso na obtenção do CSRF portal: ${portalErr.message}`);
          }
        }

        // 2. Chamada POST para a API createLink
        const payload = { urls: [cleanUrl], tag: this.tag };
        const headers = {
          'Cookie': currentCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://www.mercadolivre.com.br',
          'Referer': 'https://www.mercadolivre.com.br/l/afiliados-home'
        };

        if (csrfToken) {
          headers['x-csrf-token'] = csrfToken;
        }

        const apiRes = await axios.post(this.apiUrl, payload, { headers, timeout: 8000 });

        if (apiRes.data) {
          // Extrai o short_url do array de resposta
          if (apiRes.data.urls && apiRes.data.urls[0] && apiRes.data.urls[0].short_url) {
            const shortUrl = apiRes.data.urls[0].short_url;
            logger.info(`[AffiliateConverter] ✅ Link meli.la gerado com sucesso: ${shortUrl}`);
            return shortUrl;
          }

          // Busca via regex no corpo da resposta
          const strData = JSON.stringify(apiRes.data);
          const meliMatch = strData.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
          if (meliMatch) {
            logger.info(`[AffiliateConverter] ✅ Link meli.la extraído via regex: ${meliMatch[0]}`);
            return meliMatch[0];
          }
        }
      } catch (apiErr) {
        logger.warn(`[AffiliateConverter] ⚠️ Falha na API direta de afiliados: ${apiErr.message}`);
        if (apiErr.response?.data) {
          logger.warn(`[AffiliateConverter] Resposta da API: ${JSON.stringify(apiErr.response.data)}`);
        }
      }
    }

    // ─── ESTRATÉGIA 2: AUTOMAÇÃO VIA PUPPETEER (SE HABILITADA) ────────────────
    if (env.useMlAffiliateUi && meliUiService && process.env.NODE_ENV !== 'test') {
      try {
        const short = await meliUiService.generateShortLink(cleanUrl, this.tag, 60000);
        if (short && short.includes('meli.la')) {
          logger.info(`[AffiliateConverter] ✅ Link meli.la gerado via Puppeteer: ${short}`);
          return short;
        }
      } catch (uiErr) {
        logger.warn(`[AffiliateConverter] Falha na geração via Puppeteer: ${uiErr.message}`);
      }
    }

    // ─── ESTRATÉGIA 3: FALLBACK SEGURO COM PARÂMETRO OFICIAL DE AFILIADO ─────
    logger.warn('[AffiliateConverter] ⚠️ Cookies expirados ou API indisponível. Aplicando fallback seguro com parâmetro matt_tool.');
    return `${cleanUrl}?matt_tool=${this.tag}`;
  }

  // Alias para manter compatibilidade
  async formatLink(url) {
    return this.convertToAffiliateLink(url);
  }
}

module.exports = new AffiliateConverterService();
