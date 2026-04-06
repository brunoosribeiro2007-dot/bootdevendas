const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

const searchProducts = async (searchTerm) => {
    logger.info(`🔍 Buscando produtos no Mercado Livre para: ${searchTerm}...`);
    
    try {
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9',
                'Referer': 'https://www.google.com/'
            },
            timeout: 10000
        });

        const $ = cheerio.load(html);
        const products = [];

        // Tenta vários seletores conhecidos do ML para maior robustez
        const itemSelectors = ['.ui-search-result__wrapper', '.ui-search-layout__item', '.ui-search-result'];
        
        for (const selector of itemSelectors) {
            $(selector).each((i, element) => {
                if (i >= 15) return false;

                try {
                    const title = $(element).find('.ui-search-item__title').text().trim();
                    const priceFraction = $(element).find('.andes-money-amount__fraction').first().text().replace(/\./g, '');
                    const priceCents = $(element).find('.andes-money-amount__cents').first().text() || '00';
                    const price = parseFloat(`${priceFraction}.${priceCents}`);
                    
                    const link = $(element).find('a.ui-search-link').attr('href');
                    const image = $(element).find('img.ui-search-result-image__element').attr('data-src') || 
                                  $(element).find('img.ui-search-result-image__element').attr('src') ||
                                  $(element).find('img').first().attr('src');

                    if (title && price && link) {
                        products.push({
                            id: link.split('/MLB-')[1]?.split('-')[0] || `ML-${Math.random().toString(36).substr(2, 9)}`,
                            title,
                            price,
                            link,
                            imageUrl: image, // Padronizado CamelCase
                            description: `Oferta: ${searchTerm}`
                        });
                    }
                } catch (err) { }
            });
            if (products.length > 0) break;
        }

        // Se o scraper retornou zero (ex: bloqueado por captcha invisível), tenta a API
        if (products.length === 0) {
            logger.warn(`⚠️  Scraper retornou 0 para '${searchTerm}'. Tentando API...`);
            return await fetchFromBackupAPI(searchTerm);
        }

        logger.info(`✅ Encontrados ${products.length} produtos via Web Scraper.`);
        return products;
        
    } catch (error) {
        logger.error(`❌ Erro no Scraper do ML: ${error.message}`);
        return await fetchFromBackupAPI(searchTerm);
    }
};

const fetchFromBackupAPI = async (searchTerm) => {
    try {
        logger.info(`🔌 Buscando via API de Backup para: ${searchTerm}...`);
        const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=15`;
        const { data } = await axios.get(apiUrl);
        
        const results = data.results.map(p => ({
            id: p.id,
            title: p.title,
            price: p.price,
            link: p.permalink,
            imageUrl: p.thumbnail, // Padronizado CamelCase
            description: 'Oferta (via API)'
        }));
        
        logger.info(`✅ API retornou ${results.length} produtos.`);
        return results;
    } catch (apiErr) {
        logger.error(`❌ Backup API também falhou: ${apiErr.message}`);
        return [];
    }
};

module.exports = {
  searchProducts
};
