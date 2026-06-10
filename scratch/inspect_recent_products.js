const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

console.log('--- PRODUCTS TABLE (RECENT) ---');
const products = db.prepare('SELECT id, title, price, link, created_at FROM products ORDER BY created_at DESC LIMIT 20').all();
console.log(products);

console.log('\n--- QUEUE TABLE (RECENT) ---');
const queue = db.prepare('SELECT * FROM queue ORDER BY created_at DESC LIMIT 20').all();
console.log(queue);

db.close();
