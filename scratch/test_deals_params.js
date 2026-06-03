const axios = require('axios');
const cheerio = require('cheerio');

async function testDealsParams() {
    // MLB1574 is the standard Mercado Libre ID for "Casa, Móveis e Decoração"
    // MLB5726 is "Eletrodomésticos"
    // MLB1953 is "Mais Vendidos" or other categories
    const queries = [
        '?category_id=MLB1574',
        '?category=MLB1574',
        '?container_id=MLB_DEALS_CASA_DECORACAO',
        '?container_id=MLB_DEALS_COZINHA',
        '?domain_id=MLB-HOME_AND_KITCHEN_UTENSILS',
        '?page=1' // control test
    ];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
    };

    for (const q of queries) {
        const url = `https://www.mercadolivre.com.br/ofertas${q}`;
        console.log(`\nTesting URL: ${url}`);
        try {
            const response = await axios.get(url, {
                headers,
                timeout: 8000,
                validateStatus: () => true
            });
            console.log('Status:', response.status);
            console.log('Length:', response.data ? response.data.length : 0);
            
            if (response.data) {
                const hasChallenge = response.data.includes('verifyChallenge');
                const isSuspicious = response.data.includes('suspicious-traffic-frontend');
                console.log('Has JS challenge:', hasChallenge);
                console.log('Has suspicious-traffic block:', isSuspicious);
                
                if (!hasChallenge && !isSuspicious && response.data.length > 20000) {
                    const $ = cheerio.load(response.data);
                    const cards = $('.poly-card, .promotion-item, .ui-search-result__content-wrapper, .ui-search-item');
                    console.log('Found product elements:', cards.length);
                    
                    if (cards.length > 0) {
                        const titles = [];
                        $('.poly-component__title, .ui-search-item__title, .ui-search-result__content-title, h2, h3').slice(0, 3).each((i, el) => {
                            titles.push($(el).text().trim());
                        });
                        console.log('Sample titles:', titles);
                    }
                }
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

testDealsParams();
