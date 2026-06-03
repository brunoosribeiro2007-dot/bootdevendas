const axios = require('axios');

async function testUrls() {
    const urls = [
        'https://lista.mercadolivre.com.br/Xiaomi',
        'https://lista.mercadolivre.com.br/search?q=Xiaomi',
        'https://lista.mercadolivre.com.br/jogo-de-panelas',
        'https://lista.mercadolivre.com.br/search?q=jogo-de-panelas'
    ];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    for (const url of urls) {
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
                
                if (!hasChallenge && !isSuspicious) {
                    const cheerio = require('cheerio');
                    const $ = cheerio.load(response.data);
                    const cards = $('.poly-card, .ui-search-result__content-wrapper, .ui-search-item');
                    console.log('Found product elements:', cards.length);
                }
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

testUrls();
