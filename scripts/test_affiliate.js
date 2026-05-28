const env = require('../src/config/env');
const mlService = require('../src/services/mercadoLivre.service');
const formatter = require('../src/services/formatter.service');

const keyword = process.argv[2] || env.mlSearchKeyword.split(',')[0] || 'Kit 2 Câmera';

(async () => {
  try {
    console.log('Keyword:', keyword);
    const products = await mlService.searchProducts(keyword, env.mlCategory);
    console.log(`Found ${products.length} products.`);

    for (let i = 0; i < Math.min(products.length, 5); i++) {
      const p = products[i];
      console.log('----');
      console.log('Title:', p.title);
      console.log('Original link:', p.link);
      try {
        const formatted = await formatter.formatLink(p.link);
        console.log('Affiliate link (formatted):', formatted);
      } catch (e) {
        console.error('Error formatting link:', e.message);
      }
    }
  } catch (err) {
    console.error('Error in test script:', err.message || err);
    process.exit(1);
  }
})();
