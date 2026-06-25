const { db, initializeDB } = require('../src/database/init');

const extractMlbId = (link) => {
    if (!link || typeof link !== 'string') return null;
    const match = link.match(/MLB-?(\d+)/i);
    return match ? match[1] : null;
};

async function inspectMlb() {
    await initializeDB();
    
    try {
        const products = await db.all('SELECT id, title, link, original_link, created_at FROM products');
        console.log(`Total products in history: ${products.length}`);
        
        let nullOriginalLinkCount = 0;
        const mlbIdMap = new Map();
        
        for (const p of products) {
            if (!p.original_link) {
                nullOriginalLinkCount++;
            }
            
            const mlbId = extractMlbId(p.original_link) || extractMlbId(p.link) || extractMlbId(p.id);
            if (mlbId) {
                if (mlbIdMap.has(mlbId)) {
                    mlbIdMap.get(mlbId).push(p);
                } else {
                    mlbIdMap.set(mlbId, [p]);
                }
            }
        }
        
        console.log(`Products with NULL/empty original_link: ${nullOriginalLinkCount}`);
        
        console.log('\n--- Duplicate MLB IDs in database ---');
        let dupMlbCount = 0;
        for (const [mlbId, list] of mlbIdMap.entries()) {
            if (list.length > 1) {
                dupMlbCount++;
                console.log(`MLB ID: ${mlbId}`);
                console.log(JSON.stringify(list, null, 2));
            }
        }
        console.log(`Total duplicate MLB IDs: ${dupMlbCount}`);
        
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

inspectMlb();
