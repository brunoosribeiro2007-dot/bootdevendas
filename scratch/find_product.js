const env = require('../src/config/env');
const { db, initializeDB } = require('../src/database/init');

async function run() {
  try {
    await initializeDB();
    const product = await db.get('SELECT * FROM products WHERE link LIKE ? OR original_link LIKE ?', ['%2RemBvt%', '%2RemBvt%']);
    console.log('Produto encontrado:', JSON.stringify(product, null, 2));
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    process.exit(0);
  }
}

run();
