const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
  try {
    const res = await axios.get('https://www.mercadolivre.com.br/cupons', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    console.log('Searching for any tags with classes containing coupon or promo:');
    $('[class*="coupon"], [class*="cupom"], [class*="promo"]').each((i, el) => {
      if (i < 20) {
        console.log(`Tag: ${el.tagName} | Class: ${$(el).attr('class')} | Text: ${$(el).text().trim().replace(/\s+/g, ' ').substring(0, 100)}`);
      }
    });

    console.log('\nSearching for text match:');
    let count = 0;
    $('p, span, div, h2, h3').each((i, el) => {
      const text = $(el).clone().children().remove().end().text().trim();
      if ((text.includes('off') || text.includes('OFF') || text.includes('Cupom') || text.includes('cupom')) && text.length < 100) {
        if (count < 20) {
          console.log(`Text: "${text}" | Class: ${$(el).attr('class') || 'none'}`);
          count++;
        }
      }
    });

  } catch (e) {
    console.error('Error:', e.message);
  }
}
main();
