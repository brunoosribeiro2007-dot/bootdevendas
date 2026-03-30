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
