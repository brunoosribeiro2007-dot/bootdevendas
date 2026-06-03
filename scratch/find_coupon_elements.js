const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
  console.log('Fetching Mercado Livre deals...');
  try {
    const res = await axios.get('https://www.mercadolivre.com.br/ofertas', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(res.data);
    const productsWithCoupons = [];
    
    $('.poly-card').each((i, el) => {
      const pill = $(el).find('.poly-coupons__pill, [class*="coupons__pill"]');
      if (pill.length > 0) {
        const title = $(el).find('.poly-component__title').text().trim();
        const link = $(el).find('a.poly-component__title').attr('href');
        const couponText = pill.text().trim();
        productsWithCoupons.push({ title, link, couponText });
      }
    });
    
    console.log(`Found ${productsWithCoupons.length} products with coupons in deals.`);
    
    // Fetch PDP for the first 2 products and print text / selectors containing "cupom"
    for (let i = 0; i < Math.min(2, productsWithCoupons.length); i++) {
      const p = productsWithCoupons[i];
      console.log(`\n=============================================`);
      console.log(`Fetching PDP for: ${p.title}`);
      console.log(`Link: ${p.link}`);
      console.log(`Search Page Coupon Text: ${p.couponText}`);
      
      const pdpRes = await axios.get(p.link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        },
        timeout: 10000
      });
      
      const $pdp = cheerio.load(pdpRes.data);
      
      // Let's search for elements containing coupon info
      console.log('Searching PDP for "cupom" or "coupon":');
      const matches = [];
      $pdp('*').each((j, el) => {
        const text = $pdp(el).clone().children().remove().end().text().trim();
        if (text.toLowerCase().includes('cupom') || text.toLowerCase().includes('coupon') || text.toLowerCase().includes('insira') || text.toLowerCase().includes('código')) {
          // Only log if length is relatively short to find the actual code/badge
          if (text.length < 150) {
            matches.push({
              tagName: el.tagName,
              className: $pdp(el).attr('class') || '',
              text: text
            });
          }
        }
      });
      
      console.log('Short text matches on PDP:');
      console.log(matches.slice(0, 20));
      
      // Check for common coupon classes or IDs
      // e.g. elements with class containing 'coupon' or 'promo'
      console.log('Elements with class matching promo/coupon:');
      $pdp('[class*="coupon"], [class*="cupom"], [class*="promo"]').each((j, el) => {
        if (j < 10) {
          console.log(`Class: ${$pdp(el).attr('class')} | Text: ${$pdp(el).text().trim().substring(0, 100)}`);
        }
      });
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
