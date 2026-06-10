const { initializeDB, db } = require('../src/database/init');

async function searchDb() {
    try {
        await initializeDB();
        const rows = await db.all("SELECT id, title, link, coupon, created_at FROM products WHERE title LIKE '%Câmera De Segurança%' OR title LIKE '%Camera%'");
        console.log(`Found ${rows.length} products in DB:`);
        for (const r of rows) {
            console.log(r);
        }
        
        const queueRows = await db.all("SELECT * FROM queue WHERE product_id IN (SELECT id FROM products WHERE title LIKE '%Câmera De Segurança%' OR title LIKE '%Camera%')");
        console.log(`Found ${queueRows.length} queue items in DB:`);
        for (const q of queueRows) {
            console.log(q);
        }
    } catch (err) {
        console.error(err);
    }
}

searchDb();
