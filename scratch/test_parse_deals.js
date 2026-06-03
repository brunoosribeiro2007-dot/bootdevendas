const axios = require('axios');
const cheerio = require('cheerio');

const parseProducts = (html) => {
    if (!html || typeof html !== 'string') return [];
    
    // Otimização
    const cleanedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    let $ = cheerio.load(cleanedHtml);
    const products = [];
    
    const containerSelectors = [
        '.poly-card', 
        '.ui-search-result__content-wrapper', 
        '.ui-search-item'
    ];
    
    let foundCount = 0;

    containerSelectors.forEach(selector => {
        const els = $(selector);
        
        els.each((i, element) => {
            try {
                const titleElement = $(element).find('.poly-component__title, .ui-search-item__title, .ui-search-result__content-title, .ui-search-item__group__element.ui-search-item__title, h2, h3, a').first();
                const title = titleElement.text().trim();
                if (!title) return;

                const linkElement = $(element).find('a.poly-component__title, a.ui-search-link, a.poly-card__title, a').first();
                let link = linkElement.attr('href');
                if (!link) return;

                // 💰 More flexible price selection
                const currentMoneyEl = $(element).find('.poly-price__current .andes-money-amount, .ui-search-price__second-line .andes-money-amount, .andes-money-amount--current').first();
                let priceFrac = currentMoneyEl.find('.andes-money-amount__fraction').text().replace(/\D/g, '');
                let priceCents = currentMoneyEl.find('.andes-money-amount__cents').text().replace(/\D/g, '') || '00';
                
                if (title && priceFrac && link) {
                    const price = parseFloat(`${priceFrac}.${priceCents}`);
                    foundCount++;
                    if (products.length < 10) {
                        products.push({
                            title,
                            price,
                            link
                        });
                    }
                }
            } catch (err) {
                console.log('Error inside each loop:', err.message);
            }
        });
    });

    console.log(`Total parsed items matching criteria: ${foundCount}`);
    return products;
};

async function run() {
    const url = 'https://www.mercadolivre.com.br/ofertas?category=MLB1574';
    console.log('Fetching:', url);
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
    };

    try {
        const response = await axios.get(url, { headers, timeout: 8000 });
        const products = parseProducts(response.data);
        console.log('Parsed Products:', JSON.stringify(products, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
