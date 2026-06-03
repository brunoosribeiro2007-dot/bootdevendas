const axios = require('axios');
const cheerio = require('cheerio');

async function testDealsCategories() {
    const paths = [
        'casa-moveis-decoracao',
        'casa-cozinha',
        'eletrodomesticos',
        'ferramentas'
    ];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
    };

    for (const path of paths) {
        const url = `https://www.mercadolivre.com.br/ofertas/${path}`;
        console.log(`\nTesting: ${url}`);
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
                        const firstTitle = $('.poly-component__title, .ui-search-item__title, .ui-search-result__content-title, h2, h3').first().text();
                        console.log('First product title:', firstTitle);
                    }
                }
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

testDealsCategories();
