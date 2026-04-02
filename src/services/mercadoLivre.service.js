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
            timeout: 15000
        });

        const $ = cheerio.load(html);
        const products = [];

        $('.ui-search-result__wrapper').each((i, element) => {
            if (i >= 15) return false; // Limite de 15 produtos por busca

            try {
                const title = $(element).find('.ui-search-item__title').text().trim();
                const priceFraction = $(element).find('.andes-money-amount__fraction').first().text().replace('.', '');
                const priceCents = $(element).find('.andes-money-amount__cents').first().text() || '00';
                const price = parseFloat(`${priceFraction}.${priceCents}`);
                
                const link = $(element).find('a.ui-search-link').attr('href');
                const image = $(element).find('img.ui-search-result-image__element').attr('data-src') || 
                              $(element).find('img.ui-search-result-image__element').attr('src');

                // Filtra apenas produtos com dados válidos
                if (title && price && link) {
                    products.push({
                        id: link.split('/MLB-')[1]?.split('-')[0] || `ML-${Math.random().toString(36).substr(2, 9)}`,
                        title,
                        price,
                        link,
                        image_url: image,
                        description: `Oferta encontrada para: ${searchTerm}`
                    });
                }
            } catch (err) {
                // Pula produtos com erro de parsing
            }
        });

        logger.info(`✅ Encontrados ${products.length} produtos via Web Scraper.`);
        return products;
        
    } catch (error) {
        logger.error(`❌ Erro no Scraper do ML: ${error.message}`);
        
        // Se o Scraper falhar (ex: captcha), tentamos a API como backup final
        try {
            logger.info('⚠️ Scraper falhou. Tentando API de Backup...');
            const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=15`;
            const { data } = await axios.get(apiUrl);
            return data.results.map(p => ({
                id: p.id,
                title: p.title,
                price: p.price,
                link: p.permalink,
                image_url: p.thumbnail,
                description: 'API de Backup'
            }));
        } catch (apiErr) {
            logger.error(`❌ Backup também falhou: ${apiErr.message}`);
            return [];
        }
    }
};

module.exports = {
  searchProducts
};
