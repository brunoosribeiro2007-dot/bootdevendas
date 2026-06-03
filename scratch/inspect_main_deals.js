const axios = require('axios');
const cheerio = require('cheerio');

async function inspectMainDeals() {
    const url = 'https://www.mercadolivre.com.br/ofertas';
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
    };

    try {
        const response = await axios.get(url, { headers, timeout: 8000 });
        console.log('Main Deals Status:', response.status);
        
        const $ = cheerio.load(response.data);
        console.log('Page Title:', $('title').text());

        const dealsLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && href.includes('/ofertas')) {
                dealsLinks.push({ text, href });
            }
        });

        console.log(`Found ${dealsLinks.length} links containing '/ofertas':`);
        console.log(JSON.stringify(dealsLinks, null, 2));

    } catch (e) {
        console.error('Error:', e.message);
    }
}

inspectMainDeals();
