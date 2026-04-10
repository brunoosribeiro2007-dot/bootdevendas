const { captureTask } = require('./src/jobs/capture.job');
const { initializeDB } = require('./src/database/init');
const dbPath = require('./src/config/env').dbPath;

(async () => {
    try {
        await initializeDB();
        console.log('Running capture...');
        await captureTask();
        console.log('Capture completed. Checking database...');
        const { db } = require('./src/database/init');
        const count = await db.get("SELECT COUNT(*) as n FROM queue");
        console.log("Queue count:", count);
    } catch(e) {
        console.error(e);
    }
})();
