const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

console.log('--- Removendo itens sem meli.la da fila ---');
const beforeCount = db.prepare("SELECT COUNT(*) as total FROM queue").get().total;
const nonMeliCount = db.prepare("SELECT COUNT(*) as total FROM queue WHERE formatted_message NOT LIKE '%meli.la%'").get().total;

console.log(`Total de itens antes: ${beforeCount}`);
console.log(`Itens sem meli.la a serem removidos: ${nonMeliCount}`);

if (nonMeliCount > 0) {
  const result = db.prepare("DELETE FROM queue WHERE formatted_message NOT LIKE '%meli.la%'").run();
  console.log(`✅ Sucesso: ${result.changes} itens removidos.`);
} else {
  console.log('Nenhum item sem meli.la encontrado.');
}

const afterCount = db.prepare("SELECT COUNT(*) as total FROM queue").get().total;
console.log(`Total de itens depois: ${afterCount}`);

db.close();
