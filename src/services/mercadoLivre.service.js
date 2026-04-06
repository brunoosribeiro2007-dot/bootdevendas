const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

const searchProducts = async (searchTerm) => {
    logger.info(`🔍 Buscando produtos no Mercado Livre para: ${searchTerm}...`);
    
    try {
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm)}`;
        
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9',
                'Referer': 'https://www.google.com/'
            },
            timeout: 10000
        });

        if (html.includes('id="captcha"') || html.includes('g-recaptcha')) {
            logger.warn(`⚠️  Captcha detectado via Scraper (Mobile).`);
            return await fetchFromBackupAPI(searchTerm);
        }

        const $ = cheerio.load(html);
        const products = [];

        // Seletores mobile e desktop mistos
        const itemSelectors = ['.ui-search-result__wrapper', '.ui-search-layout__item', '.ui-search-result', 'li.ui-search-layout__item'];
        
        for (const selector of itemSelectors) {
            $(selector).each((i, element) => {
                if (products.length >= 10) return false;

                try {
                    const title = $(element).find('.ui-search-item__title').text().trim();
                    let priceText = $(element).find('.andes-money-amount__fraction').first().text().replace(/\./g, '');
                    const priceCents = $(element).find('.andes-money-amount__cents').first().text() || '00';
                    const price = parseFloat(`${priceText}.${priceCents}`);
                    
                    const link = $(element).find('a').first().attr('href');
                    const image = $(element).find('img').first().attr('data-src') || 
                                  $(element).find('img').first().attr('src');

                    if (title && price && link && link.includes('mercadolivre.com.br')) {
                        products.push({
                            id: link.split('/MLB-')[1]?.split('-')[0] || `ML-${Math.random().toString(36).substr(2, 9)}`,
                            title,
                            price,
                            link,
                            imageUrl: image,
                            description: `Oferta: ${searchTerm}`
                        });
                    }
                } catch (err) { }
            });
            if (products.length > 0) break;
        }

        if (products.length === 0) {
            return await fetchFromBackupAPI(searchTerm);
        }

        logger.info(`✅ Encontrados ${products.length} produtos via Scraper.`);
        return products;
        
    } catch (error) {
        logger.error(`❌ Erro no Scraper: ${error.message}`);
        return await fetchFromBackupAPI(searchTerm);
    }
};

const fetchFromBackupAPI = async (searchTerm) => {
    try {
        logger.info(`🔌 Tentando API de Backup (Mobile UserAgent)...`);
        const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=10`;
        
        const { data } = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
                'Accept': 'application/json'
            }
        });
        
        const results = data.results.map(p => ({
            id: p.id,
            title: p.title,
            price: p.price,
            link: p.permalink,
            imageUrl: p.thumbnail,
            description: 'Oferta (via API)'
        }));
        
        logger.info(`✅ API retornou ${results.length} produtos.`);
        return results;
    } catch (apiErr) {
        const detail = apiErr.response ? `Status ${apiErr.response.status}` : 'Sem resposta';
        logger.error(`❌ Falha total na API (${detail}): ${apiErr.message}`);
        return [];
    }
};

module.exports = {
  searchProducts
};
