const { db, initializeDB, isPostgres } = require('../src/database/init');

async function testTimezone() {
    await initializeDB();
    if (!isPostgres()) {
        console.log('Not using PostgreSQL. Skipping.');
        process.exit(0);
    }
    
    try {
        const timeObj = await db.get("SELECT NOW() as db_now, NOW() - INTERVAL '3 days' as db_three_days_ago");
        console.log('Postgres NOW():', timeObj.db_now);
        console.log('Postgres 3 days ago:', timeObj.db_three_days_ago);
        
        const countOld = await db.get("SELECT COUNT(*) as count FROM products WHERE created_at < NOW() - INTERVAL '3 days'");
        console.log('Products matching prune condition (> 3 days):', countOld.count);
        
        const countAll = await db.get("SELECT COUNT(*) as count FROM products");
        console.log('Total products:', countAll.count);
        
        const minMax = await db.get("SELECT MIN(created_at) as min_date, MAX(created_at) as max_date FROM products");
        console.log('Oldest product in DB:', minMax.min_date);
        console.log('Newest product in DB:', minMax.max_date);
        
    } catch (err) {
        console.error('Error:', err);
    }
    process.exit(0);
}

testTimezone();
