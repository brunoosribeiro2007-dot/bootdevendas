const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

console.log('--- Buscando produtos com Copo ou Stanley ---');
const products = db.prepare("SELECT * FROM products WHERE title LIKE '%Copo%' OR title LIKE '%Stanley%' LIMIT 5").all();
console.log('Produtos:', JSON.stringify(products, null, 2));

const queue = db.prepare("SELECT * FROM queue WHERE formatted_message LIKE '%Copo%' OR formatted_message LIKE '%Stanley%' LIMIT 5").all();
console.log('Fila:', JSON.stringify(queue, null, 2));

db.close();
