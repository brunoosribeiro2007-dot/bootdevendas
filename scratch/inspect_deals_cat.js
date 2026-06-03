const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

async function inspect() {
    const url = 'https://www.mercadolivre.com.br/ofertas/casa-moveis-decoracao';
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9'
    };

    try {
        const response = await axios.get(url, { headers, timeout: 8000 });
        console.log('Status:', response.status);
        console.log('Length:', response.data.length);
        
        fs.writeFileSync(path.join(__dirname, 'deals_cat.html'), response.data);
        console.log('Saved to deals_cat.html');
        
        const $ = cheerio.load(response.data);
        
        console.log('Page Title:', $('title').text());
        
        // Find some general links and see what's on the page
        const links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && (href.includes('MLB') || href.includes('produto'))) {
                links.push({ text, href });
            }
        });
        
        console.log(`Found ${links.length} product-related links:`);
        console.log(JSON.stringify(links.slice(0, 10), null, 2));
        
        // Print some class names or div classes that might contain items
        const divClasses = new Set();
        $('div').each((i, el) => {
            const cls = $(el).attr('class');
            if (cls) {
                cls.split(' ').forEach(c => {
                    if (c.includes('item') || c.includes('card') || c.includes('product') || c.includes('deal') || c.includes('offer')) {
                        divClasses.add(c);
                    }
                });
            }
        });
        
        console.log('Interesting div classes:', Array.from(divClasses));

    } catch (e) {
        console.error('Error:', e.message);
    }
}

inspect();
