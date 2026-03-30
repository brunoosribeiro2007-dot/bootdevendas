const axios = require('axios');
const logger = require('../config/logger');
const { withRetry } = require('../utils/retry');

const BASE_URL = 'https://api.mercadolibre.com';

class MercadoLivreService {
  async searchProducts(keyword, category = '') {
    logger.info(`Buscando produtos no ML. Keyword: ${keyword}, Category: ${category}`);
    const fn = async () => {
      const response = await axios.get(`${BASE_URL}/sites/MLB/search`, {
        params: {
          q: keyword,
          category: category,
          limit: 10,
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        }
      });
      return response.data.results;
    };

    const results = await withRetry(fn);
    return results.map(this.normalizeProduct);
  }

  normalizeProduct(raw) {
    return {
      id: raw.id,
      title: raw.title,
      price: raw.price,
      link: raw.permalink,
      imageUrl: raw.thumbnail.replace('-I.jpg', '-O.jpg'),
      description: raw.title,
    };
  }
}

module.exports = new MercadoLivreService();
