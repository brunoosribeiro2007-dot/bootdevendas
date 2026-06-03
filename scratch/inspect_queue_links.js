const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

const ids = [1534, 1576, 1608];
for (const id of ids) {
  const queueItem = db.prepare('SELECT * FROM queue WHERE id = ?').get(id);
  console.log(`\n=== Queue Item ${id} ===`);
  console.log(JSON.stringify(queueItem, null, 2));
  if (queueItem) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(queueItem.product_id);
    console.log(`=== Product ${queueItem.product_id} ===`);
    console.log(JSON.stringify(product, null, 2));
  }
}
db.close();
