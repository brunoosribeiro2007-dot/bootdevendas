const env = require('../src/config/env');
const { initializeDB } = require('../src/database/init');
const { captureTask } = require('../src/jobs/capture.job');

async function run() {
    console.log('Initializing database connection...');
    await initializeDB();
    
    console.log('Running capture task...');
    try {
        await captureTask();
        console.log('Capture task completed successfully.');
    } catch (err) {
        console.error('Capture task failed:', err);
    }
    process.exit(0);
}

run().catch(console.error);
