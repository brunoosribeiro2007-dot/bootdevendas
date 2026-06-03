const axios = require('axios');
const cheerio = require('cheerio');

async function testDeals() {
    const url = 'https://www.mercadolivre.com.br/ofertas#nav-header';
    console.log('Testing daily deals URL:', url);
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    try {
        const response = await axios.get(url, {
            headers,
            timeout: 10000,
            validateStatus: () => true
        });

        console.log('Response Status:', response.status);
        console.log('Body Length:', response.data ? response.data.length : 0);
        
        if (response.data) {
            const hasChallenge = response.data.includes('verifyChallenge');
            const isSuspicious = response.data.includes('suspicious-traffic-frontend');
            console.log('Has JS challenge:', hasChallenge);
            console.log('Has suspicious-traffic block:', isSuspicious);
            
            if (!hasChallenge && !isSuspicious) {
                const $ = cheerio.load(response.data);
                const products = [];
                
                // Let's see if we can find any products on the page
                const cards = $('.poly-card, .promotion-item, .ui-search-result__content-wrapper, .ui-search-item');
                console.log('Found product elements on page:', cards.length);
            }
        }
    } catch (error) {
        console.error('Error during deals inspect:', error);
    }
}

testDeals();
