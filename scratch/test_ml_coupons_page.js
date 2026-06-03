const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
  console.log('Fetching Mercado Livre coupons page...');
  try {
    const res = await axios.get('https://www.mercadolivre.com.br/cupons', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    });
    
    console.log('HTML size:', res.data.length);
    const $ = cheerio.load(res.data);
    
    // Let's look for elements that might be coupons
    console.log('Searching for codes or coupon text:');
    
    // Look for coupon code elements. In ML coupons page, codes are usually inside elements with text or specific classes.
    const coupons = [];
    $('*').each((i, el) => {
      const text = $(el).clone().children().remove().end().text().trim();
      // Look for uppercase alphanumeric strings or elements containing "cupom"
      if (text.length > 2 && text.length < 25 && /^[A-Z0-9_\-]+$/.test(text)) {
        // Potential coupon code!
        const parentText = $(el).parent().text().trim().replace(/\s+/g, ' ');
        if (parentText.toLowerCase().includes('cupom') || parentText.toLowerCase().includes('off') || parentText.toLowerCase().includes('desconto')) {
          coupons.push({
            code: text,
            context: parentText.substring(0, 150)
          });
        }
      }
    });
    
    console.log('Found potential coupons:', coupons.slice(0, 30));
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
