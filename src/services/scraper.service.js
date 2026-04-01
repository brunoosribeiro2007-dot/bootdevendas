const logger = require('../config/logger');

// Scraper neutralizado para economizar RAM. 
// O bot agora utiliza apenas a API leve do Mercado Livre para estabilidade no Render Free.
class ScraperService {
    async searchWithBrowser(keyword) {
        logger.warn('Scraper de navegador desativado para economizar RAM. Usando apenas API.');
        return [];
    }
}

module.exports = new ScraperService();
