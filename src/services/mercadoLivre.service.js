const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

const searchProducts = async (searchTerm) => {
    logger.info(`🔍 Buscando produtos no Mercado Livre para: ${searchTerm}...`);
    
    // Lista de User-Agents reais e modernos
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.101 Mobile/15E148 Safari/604.1'
    ];

    const referers = [
        'https://www.google.com/',
        'https://www.bing.com/',
        'https://duckduckgo.com/',
        'https://t.co/'
    ];

    try {
        // Usando endpoint alternativo (mais antigo / jm) ou padrão com parâmetros de mobile
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm)}#D[A:${encodeURIComponent(searchTerm)}]`;
        
        const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        const selectedRef = referers[Math.floor(Math.random() * referers.length)];

        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': selectedUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'max-age=0',
                'Referer': selectedRef,
                'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 15000
        });

        const $ = cheerio.load(html);
        const pageTitle = $('title').text();
        
        if (html.includes('id="captcha"') || html.includes('g-recaptcha') || html.includes('Forbidden') || pageTitle.includes('Acesso') || pageTitle.includes('Segurança')) {
            logger.warn(`⚠️ Bloqueio detectado ("${pageTitle}") para "${searchTerm}". Tentando API Fallback...`);
            return await fetchFromBackupAPI(searchTerm);
        }

        const products = [];
        const getStableId = (link, title) => {
            const mlbMatch = link.match(/MLB-?(\d+)/i);
            if (mlbMatch) return `MLB${mlbMatch[1]}`;
            const hash = Buffer.from(title || link).toString('base64').substring(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
            return `MLH-${hash}`;
        };

        // Seletor Grid
        $('.poly-card__content').each((i, element) => {
            if (products.length >= 10) return false;
            try {
                const title = $(element).find('.poly-component__title').text().trim() || $(element).find('h2').text().trim();
                const priceFrac = $(element).find('.andes-money-amount__fraction').first().text().replace(/\D/g, '');
                const priceCents = $(element).find('.andes-money-amount__cents').first().text() || '00';
                const price = parseFloat(`${priceFrac}.${priceCents}`);
                const link = $(element).find('a').first().attr('href');
                const image = $(element).closest('.poly-card').find('img').attr('data-src') || 
                              $(element).closest('.poly-card').find('img').attr('src');

                if (title && price && link) {
                    products.push({ id: getStableId(link, title), title, price, link, imageUrl: image, description: `Oferta: ${searchTerm}` });
                }
            } catch (err) {}
        });

        // Seletor Lista
        if (products.length === 0) {
            $('.ui-search-result__content-wrapper').each((i, element) => {
                if (products.length >= 10) return false;
                try {
                    const title = $(element).find('.ui-search-item__title').text().trim();
                    const priceFrac = $(element).find('.andes-money-amount__fraction').first().text().replace(/\D/g, '');
                    const priceCents = $(element).find('.andes-money-amount__cents').first().text() || '00';
                    const price = parseFloat(`${priceFrac}.${priceCents}`);
                    const link = $(element).find('a').attr('href');
                    const image = $(element).closest('.ui-search-result').find('img').attr('data-src') || 
                                  $(element).closest('.ui-search-result').find('img').attr('src');
                    if (title && price && link) {
                        products.push({ id: getStableId(link, title), title, price, link, imageUrl: image, description: `Oferta: ${searchTerm}` });
                    }
                } catch (err) {}
            });
        }

        if (products.length === 0) {
            return await fetchFromBackupAPI(searchTerm);
        }

        logger.info(`✅ Sucesso no Scraper para "${searchTerm}" (${products.length} itens).`);
        return products;
        
    } catch (error) {
        logger.error(`❌ Erro Scraper (${searchTerm}): ${error.message}`);
        return await fetchFromBackupAPI(searchTerm);
    }
};

const fetchFromBackupAPI = async (searchTerm) => {
    try {
        logger.info(`🔌 Tentando API Fallback camuflada para: ${searchTerm}...`);
        const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=10`;
        
        // Camuflagem de App Nativo para a API
        const { data } = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'MercadoLibre/7.32.1 Android/13 (SM-S918B)',
                'X-Platform': 'MLB',
                'X-User-Agent': 'Visual-Search/1.0',
                'Accept': 'application/json',
                'Referer': 'https://www.mercadolivre.com.br/'
            },
            timeout: 10000
        });
        
        if (!data.results || data.results.length === 0) return [];

        const results = data.results.map(p => ({
            id: p.id,
            title: p.title,
            price: p.price,
            link: p.permalink,
            imageUrl: p.thumbnail?.replace('-I.jpg', '-O.jpg'),
            description: 'Oferta (via API Camuflada)'
        }));
        
        logger.info(`✅ API Fallback funcionou para "${searchTerm}"! (${results.length} itens).`);
        return results;
    } catch (apiErr) {
        logger.error(`❌ Falha total (IP Bloqueado no Render) para "${searchTerm}".`);
        return [];
    }
};

module.exports = {
  searchProducts
};
