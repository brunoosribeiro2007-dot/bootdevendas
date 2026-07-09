const env = require('../src/config/env');
const { db, initializeDB } = require('../src/database/init');
const logger = require('../src/config/logger');

async function run() {
  try {
    await initializeDB();
    console.log('--- Ultimos 20 Produtos ---');
    const products = await db.all('SELECT id, title, price, link, original_link, coupon, created_at FROM products ORDER BY created_at DESC LIMIT 20');
    console.log(JSON.stringify(products, null, 2));

    console.log('--- Fila de Envio (Queue) ---');
    const queue = await db.all('SELECT * FROM queue ORDER BY created_at DESC LIMIT 20');
    console.log(JSON.stringify(queue, null, 2));
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    process.exit(0);
  }
}

run();
