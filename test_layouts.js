const axios = require('axios');
const cheerio = require('cheerio');

async function testKeyword(keyword) {
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(keyword)}`;
    console.log(`Checking: ${url}`);
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const $ = cheerio.load(data);
    
    const gridItems = $('.poly-card__content').length;
    const listItems = $('.ui-search-result__content-wrapper').length;
    
    console.log(`Keyword: ${keyword}`);
    console.log(`Grid items (.poly-card__content): ${gridItems}`);
    console.log(`List items (.ui-search-result__content-wrapper): ${listItems}`);
}

(async () => {
    await testKeyword('Xiaomi');
    await testKeyword('TV Philco');
    await testKeyword('cadeira gamer');
})();
