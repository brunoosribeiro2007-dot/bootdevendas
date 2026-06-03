const axios = require('axios');
const cheerio = require('cheerio');

async function testProxies() {
    const searchTerm = 'Xiaomi';
    const targetUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm)}`;
    
    const proxies = [
        { name: 'Corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` },
        { name: 'Codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}` },
        { name: 'Thingproxy', url: `https://thingproxy.freeboard.io/fetch/${targetUrl}` },
        { name: 'AllOrigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}` }
    ];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    };

    for (const proxy of proxies) {
        console.log(`\nTesting proxy: ${proxy.name} (${proxy.url.substring(0, 80)}...)`);
        try {
            const response = await axios.get(proxy.url, {
                headers,
                timeout: 10000,
                validateStatus: () => true
            });
            console.log('Status:', response.status);
            
            let html = response.data;
            if (proxy.name === 'AllOrigins') {
                if (html && html.contents) {
                    html = html.contents;
                }
            }

            console.log('Length:', html ? html.length : 0);
            
            if (html && typeof html === 'string') {
                const hasChallenge = html.includes('verifyChallenge');
                const isSuspicious = html.includes('suspicious-traffic-frontend');
                console.log('Has JS challenge:', hasChallenge);
                console.log('Has suspicious-traffic block:', isSuspicious);
                
                if (!hasChallenge && !isSuspicious && html.length > 20000) {
                    const $ = cheerio.load(html);
                    const cards = $('.poly-card, .ui-search-result__content-wrapper, .ui-search-item');
                    console.log('Found product elements:', cards.length);
                    if (cards.length > 0) {
                        console.log('🎉 SUCCESS! Proxy', proxy.name, 'returned search results!');
                        // Print first product title
                        const firstTitle = $('.poly-component__title, .ui-search-item__title, .ui-search-result__content-title, h2, h3').first().text();
                        console.log('First product title:', firstTitle);
                    }
                }
            }
        } catch (e) {
            console.error('Error with proxy:', proxy.name, e.message);
        }
    }
}

testProxies();
