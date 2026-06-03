const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

console.log('--- Mensagens Publicadas Recentes ---');
const rows = db.prepare("SELECT id, formatted_message FROM queue WHERE status = 'published' ORDER BY updated_at DESC LIMIT 5").all();

for (const row of rows) {
  console.log(`\n=== ID ${row.id} ===`);
  console.log(row.formatted_message);
  console.log('==================');
}

db.close();
