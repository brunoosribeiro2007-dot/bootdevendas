const axios = require('axios');
const cheerio = require('cheerio');

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
        const $ = cheerio.load(response.data);
        
        const card = $('.poly-card').first();
        if (card.length === 0) {
            console.log('No .poly-card found!');
            return;
        }

        // Print all elements inside the card that contain text that looks like a price (e.g. starting with R$)
        console.log('--- Price-like elements text and HTML ---');
        card.find('*').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('R$')) {
                const cls = $(el).attr('class') || '';
                console.log(`Tag: ${el.name}, Class: "${cls}", Text: "${text}"`);
            }
        });
        
        console.log('\n--- Full HTML of the card ---');
        console.log(card.html());

    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
