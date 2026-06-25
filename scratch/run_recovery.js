const { initializeDB } = require('../src/database/init');
const repository = require('../src/database/repository');

async function run() {
    console.log('Initializing database connection...');
    await initializeDB();
    
    console.log('\nRunning resetStuckSendingItems...');
    const resetCount = await repository.resetStuckSendingItems();
    console.log(`Reset ${resetCount} stuck items.`);
    
    console.log('\nChecking queue status...');
    const queueCounts = await repository.getQueue(null);
    console.log(`Total items in queue: ${queueCounts.length}`);
    queueCounts.forEach(item => {
        console.log(`- ID: ${item.id}, Title: "${item.title}", Status: ${item.status}`);
    });
    
    process.exit(0);
}

run().catch(console.error);
