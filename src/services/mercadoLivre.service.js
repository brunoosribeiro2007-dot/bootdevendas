const axios = require('axios');
const logger = require('../config/logger');
const { withRetry } = require('../utils/retry');
const scraperService = require('./scraper.service');

const BASE_URL = 'https://api.mercadolibre.com';

class MercadoLivreService {
  async searchProducts(keyword, category = '') {
    logger.info(`Buscando produtos no ML. Keyword: ${keyword}`);
    
    const searchTerm = keyword || 'oferta';
    
    // 🎯 FOCO NA API PARA ECONOMIA DE RAM (Evita estourar o limite de 512MB do Render)
    try {
        const searchUrl = `${BASE_URL}/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&sort=relevance&condition=new&limit=25`;
        logger.info(`Buscando via API para: ${searchTerm}...`);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Origin': 'https://www.mercadolivre.com.br',
                'Referer': 'https://www.mercadolivre.com.br/'
            },
            timeout: 15000 // Tenta por 15s antes de desistir
        });

        if (response.data && response.data.results && response.data.results.length > 0) {
            const products = response.data.results.map(p => this.normalizeProduct(p));
            logger.info(`✅ API retornou ${products.length} produtos para '${searchTerm}'.`);
            return products;
        }
        
        logger.warn(`API retornou zero resultados para '${searchTerm}'.`);
    } catch (e) {
        logger.warn(`⚠️ API falhou ou deu 403 (${e.message}). Tentando Scraper Robusto...`);
        try {
            const scraperProducts = await scraperService.searchWithBrowser(searchTerm);
            if (scraperProducts && scraperProducts.length > 0) {
                return scraperProducts.map(p => this.normalizeProduct(p));
            }
        } catch (err) {
            logger.error(`Scraper robusto também falhou: ${err.message}`);
        }
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
