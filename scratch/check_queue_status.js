const { initializeDB, db } = require('../src/database/init');

async function checkQueue() {
    try {
        await initializeDB();
        const totalProducts = await db.get('SELECT COUNT(*) as count FROM products');
        const totalQueue = await db.get('SELECT COUNT(*) as count FROM queue');
        const approvedQueue = await db.get("SELECT COUNT(*) as count FROM queue WHERE status = 'approved'");
        
        console.log('=== DATABASE STATUS ===');
        console.log(`Total products: ${totalProducts ? totalProducts.count : 0}`);
        console.log(`Total queue items: ${totalQueue ? totalQueue.count : 0}`);
        console.log(`Approved queue items (pending publication): ${approvedQueue ? approvedQueue.count : 0}`);
        
        const nextItem = await db.get(`
            SELECT q.id, p.title, q.status 
            FROM queue q 
            JOIN products p ON q.product_id = p.id 
            ORDER BY q.created_at ASC 
            LIMIT 3
        `);
        if (nextItem) {
            console.log('Next items in queue:', nextItem);
        } else {
            console.log('No items in queue.');
        }
    } catch (err) {
        console.error('Error querying queue:', err);
    }
}

checkQueue();
