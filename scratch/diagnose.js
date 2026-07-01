const { initializeDB, db, isPostgres } = require('../src/database/init');
const env = require('../src/config/env');

async function run() {
    console.log('=== DIAGNOSTIC START ===');
    console.log('Local Machine Time:', new Date().toISOString());
    console.log('Local Timezone Offset:', new Date().getTimezoneOffset());
    
    try {
        await initializeDB();
        console.log('Database Mode:', isPostgres() ? 'PostgreSQL (Supabase)' : 'SQLite Local');
        
        // 1. Get Database Time
        let dbTime;
        if (isPostgres()) {
            const res = await db.get('SELECT NOW() as now');
            dbTime = res.now;
        } else {
            const res = await db.get("SELECT datetime('now') as now");
            dbTime = res.now;
        }
        console.log('Database Time:', dbTime);

        // 2. Count Products
        const prodCount = await db.get('SELECT COUNT(*) as count FROM products');
        console.log('Total Products in History:', prodCount.count);

        // 3. Count Queue by Status
        const queueStats = await db.all('SELECT status, COUNT(*) as count FROM queue GROUP BY status');
        console.log('Queue Stats:', queueStats);

        // 4. Last 5 Queue Items
        const lastQueue = await db.all('SELECT id, product_id, status, created_at, updated_at FROM queue ORDER BY id DESC LIMIT 5');
        console.log('Last 5 Queue Items:', lastQueue);

        // 5. Check if WhatsApp Session exists in DB
        const sessionExists = await db.get('SELECT id, updated_at FROM sessions WHERE id = ?', ['session_bundle']);
        console.log('WhatsApp Session Bundle in DB:', sessionExists ? `Yes (Updated at: ${sessionExists.updated_at})` : 'No');

        // 6. Check env configuration
        console.log('Configuration:');
        console.log('- CRON_CAPTURE_SCHEDULE:', env.cronCaptureSchedule);
        console.log('- CRON_PUBLISH_SCHEDULE:', env.cronPublishSchedule);
        console.log('- PUBLISH_START_TIME:', env.publishStartTime);
        console.log('- PUBLISH_END_TIME:', env.publishEndTime);
        console.log('- WHATSAPP_TARGET_NUMBER:', env.whatsappTargetNumber);
        console.log('- WHATSAPP_TARGET_GROUP:', env.whatsappTargetGroup);

    } catch (err) {
        console.error('Diagnostic Error:', err);
    }
    console.log('=== DIAGNOSTIC END ===');
}

run();
