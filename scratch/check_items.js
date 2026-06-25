const { initializeDB, db } = require('../src/database/init');

async function run() {
    await initializeDB();
    try {
        const items = await db.all(`
            SELECT q.id as queue_id, q.status, q.created_at, p.* 
            FROM queue q 
            LEFT JOIN products p ON q.product_id = p.id 
            WHERE q.id IN (373, 374, 375)
        `);
        console.log('Stuck Items Details:');
        console.log(JSON.stringify(items, null, 2));
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

run().catch(console.error);
