const { db, initializeDB, isPostgres } = require('../src/database/init');
const logger = require('../src/config/logger');

async function inspect() {
    console.log('Initializing database connection...');
    await initializeDB();
    
    console.log('Database type PostgreSQL:', isPostgres());
    
    try {
        const productsCount = await db.get('SELECT COUNT(*) as count FROM products');
        console.log('Total products in products table:', productsCount.count);
        
        const queueCount = await db.get('SELECT COUNT(*) as count FROM queue');
        console.log('Total items in queue table:', queueCount.count);
        
        console.log('\n--- Recent 10 Products in History ---');
        const recentProducts = await db.all('SELECT id, title, link, created_at FROM products ORDER BY created_at DESC LIMIT 10');
        console.table(recentProducts);
        
        console.log('\n--- Queue Items ---');
        const queueItems = await db.all('SELECT q.id, q.product_id, p.title, q.status, q.created_at FROM queue q JOIN products p ON q.product_id = p.id ORDER BY q.created_at DESC');
        console.table(queueItems);
        
    } catch (err) {
        console.error('Error during inspection:', err);
    }
    
    process.exit(0);
}

inspect();
