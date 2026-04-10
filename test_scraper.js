const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
    const { data } = await axios.get("https://lista.mercadolivre.com.br/cadeira-gamer", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    
    const $ = cheerio.load(data);
    const products = [];
    
    $('.poly-card__content').each((i, el) => {
        const title = $(el).find('.poly-component__title').text().trim() || $(el).find('h2').text().trim();
        const link = $(el).find('a').attr('href');
        let price = $(el).find('.andes-money-amount__fraction').first().text();
        const img = $(el).closest('.poly-card').find('img.poly-component__picture').attr('data-src') || $(el).closest('.poly-card').find('img').attr('src');
        
        if (title && price) {
            products.push({ title, link, price, img });
        }
    });

    console.log(`Found ${products.length} products`);
    if(products.length > 0) {
        console.log(products[0]);
    }
})();
