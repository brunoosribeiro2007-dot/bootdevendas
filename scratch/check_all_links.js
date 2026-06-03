const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

console.log('--- Analisando todos os links na fila (queue) ---');
const rows = db.prepare('SELECT id, formatted_message FROM queue').all();

const domains = {};
let total = 0;

for (const row of rows) {
  total++;
  const links = row.formatted_message.match(/https?:\/\/[^\s*]+/g) || [];
  for (const link of links) {
    try {
      const url = new URL(link.replace(/[*_~()]/g, ''));
      domains[url.hostname] = (domains[url.hostname] || 0) + 1;
      if (!url.hostname.includes('meli.la') && !url.hostname.includes('mercadolivre') && !url.hostname.includes('mercadolibre')) {
        console.log(`[ID ${row.id}] Link não-oficial encontrado: ${link}`);
      }
    } catch (e) {
      // Ignora erros de parse de link parcial
    }
  }
}

console.log('\nResumo de domínios encontrados nos links da fila:');
console.log(JSON.stringify(domains, null, 2));
console.log(`Total de mensagens analisadas: ${total}`);
db.close();
