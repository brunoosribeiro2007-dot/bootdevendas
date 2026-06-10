const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

try {
  const pCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
  console.log('Total products:', pCount.count);

  const qCount = db.prepare('SELECT COUNT(*) as count FROM queue').get();
  console.log('Total queue items:', qCount.count);

  console.log('Some non-test products:');
  const products = db.prepare("SELECT id, title, price, link, created_at FROM products WHERE id NOT LIKE 'ML-TEST-%' ORDER BY created_at DESC LIMIT 20").all();
  console.log(products);

  console.log('Queue items where status = approved:');
  const approved = db.prepare("SELECT * FROM queue WHERE status = 'approved' LIMIT 5").all();
  console.log(approved);
} catch (e) {
  console.error(e);
} finally {
  db.close();
}
