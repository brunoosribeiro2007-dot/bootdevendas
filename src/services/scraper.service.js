const logger = require('../config/logger');

class ScraperService {
    async searchWithBrowser(keyword) {
        logger.info(`Busca via navegador desativada para economia de RAM (Modo Slim).`);
        return [];
    }
}

module.exports = new ScraperService();
