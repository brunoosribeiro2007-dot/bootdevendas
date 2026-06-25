const env = require('../src/config/env');
const { initializeDB, db } = require('../src/database/init');
const logger = require('../src/config/logger');

async function run() {
    console.log('Initializing database connection...');
    await initializeDB();
    
    console.log('\n--- Environment Configuration ---');
    console.log('DATABASE_URL:', env.databaseUrl ? 'Configured (Supabase)' : 'Not configured (using SQLite)');
    console.log('WHATSAPP_TARGET_NUMBER:', env.whatsappTargetNumber);
    console.log('WHATSAPP_TARGET_GROUP:', env.whatsappTargetGroup);
    console.log('CRON_CAPTURE_SCHEDULE:', env.cronCaptureSchedule);
    console.log('CRON_PUBLISH_SCHEDULE:', env.cronPublishSchedule);
    console.log('PUBLISH_START_TIME:', env.publishStartTime);
    console.log('PUBLISH_END_TIME:', env.publishEndTime);
    
    try {
        const productCount = await db.get('SELECT COUNT(*) as count FROM products');
        console.log('\nTotal products in products table:', productCount.count);
        
        const queueCounts = await db.all('SELECT status, COUNT(*) as count FROM queue GROUP BY status');
        console.log('\nQueue items by status:');
        if (queueCounts.length === 0) {
            console.log('No items in queue table.');
        } else {
            queueCounts.forEach(row => {
                console.log(`- ${row.status}: ${row.count}`);
            });
        }
        
        const lastApproved = await db.all(`
            SELECT q.id, q.product_id, p.title, q.status, q.created_at 
            FROM queue q 
            JOIN products p ON q.product_id = p.id 
            ORDER BY q.created_at DESC 
            LIMIT 5
        `);
        console.log('\nLast 5 items in queue:');
        if (lastApproved.length === 0) {
            console.log('None.');
        } else {
            lastApproved.forEach(item => {
                console.log(`- ID: ${item.id}, Title: "${item.title}", Status: ${item.status}, Created: ${item.created_at}`);
            });
        }
        
    } catch (err) {
        console.error('Error querying database:', err);
    }
    
    process.exit(0);
}

run().catch(console.error);
