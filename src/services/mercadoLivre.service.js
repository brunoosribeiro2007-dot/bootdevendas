const axios = require('axios');
const logger = require('../config/logger');
const { withRetry } = require('../utils/retry');
const scraperService = require('./scraper.service');

const BASE_URL = 'https://api.mercadolibre.com';

class MercadoLivreService {
  async searchProducts(keyword, category = '') {
    logger.info(`Buscando produtos no ML. Keyword: ${keyword}`);
    
    const searchTerm = keyword || 'oferta';
    
    // 1. TENTA PRIMEIRO VIA API (MAIS LEVE PARA MEMÓRIA)
    try {
        const searchUrl = `${BASE_URL}/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&sort=relevance&condition=new&limit=20`;
        logger.info(`Tentando busca via API leve para: ${searchTerm}...`);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        if (response.data && response.data.results && response.data.results.length > 0) {
            return response.data.results.map(p => this.normalizeProduct(p));
        }
    } catch (e) {
        logger.warn(`API falhou ou deu 403 (${e.message}). Tentando Scraper de navegador...`);
    }

    // 2. TENTA VIA NAVEGADOR (ÚLTIMO RECURSO POIS GASTA MUITA RAM)
    try {
        const browserProducts = await scraperService.searchWithBrowser(searchTerm);
        if (browserProducts && browserProducts.length > 0) {
            return browserProducts.map(p => this.normalizeProduct(p));
        }
    } catch (e) {
        logger.error(`Scraper via navegador também falhou: ${e.message}`);
    }

    return [];
  }

  normalizeProduct(raw) {
    if (!raw) return null;
    const shortLink = raw.link || `https://produto.mercadolivre.com.br/${raw.id}`;
    return {
      id: raw.id,
      title: raw.title,
      price: raw.price,
      link: shortLink,
      imageUrl: raw.thumbnail ? raw.thumbnail.replace('-I.jpg', '-O.jpg').replace('-V.jpg', '-O.jpg') : '',
      description: raw.title,
    };
  }
}

module.exports = new MercadoLivreService();
