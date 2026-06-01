const mlService = require('../src/services/mercadoLivre.service');
const logger = require('../src/config/logger');

// Disable logger output for cleaner console
logger.level = 'error';

async function run() {
  try {
    const products = await mlService.searchProducts('Cadeira gamer');
    console.log(`Found ${products.length} products`);
    if (products.length > 0) {
        console.log(JSON.stringify(products[0], null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
}
run();
