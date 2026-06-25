const { db, initializeDB } = require('../src/database/init');

async function findDuplicates() {
    await initializeDB();
    
    try {
        const allProducts = await db.all('SELECT id, title, link, original_link, image_url, created_at FROM products');
        console.log(`Total products to analyze: ${allProducts.length}`);
        
        const duplicates = [];
        const seenIds = new Set();
        const seenLinks = new Map();
        const seenOriginalLinks = new Map();
        const seenTitles = new Map();
        const seenImages = new Map();
        
        const normalizeTitle = (title) => {
            if (!title) return '';
            return title
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };
        
        for (const p of allProducts) {
            const normTitle = normalizeTitle(p.title);
            
            // Check ID
            if (seenIds.has(p.id)) {
                duplicates.push({ type: 'ID', item1: p, item2: { id: p.id } });
            } else {
                seenIds.add(p.id);
            }
            
            // Check link
            if (p.link) {
                const cleanLink = p.link.split('?')[0].split('#')[0].trim();
                if (seenLinks.has(cleanLink)) {
                    duplicates.push({ type: 'Link', item1: p, item2: seenLinks.get(cleanLink) });
                } else {
                    seenLinks.set(cleanLink, p);
                }
            }
            
            // Check original_link
            if (p.original_link) {
                const cleanOrig = p.original_link.split('?')[0].split('#')[0].trim();
                if (seenOriginalLinks.has(cleanOrig)) {
                    duplicates.push({ type: 'Original Link', item1: p, item2: seenOriginalLinks.get(cleanOrig) });
                } else {
                    seenOriginalLinks.set(cleanOrig, p);
                }
            }
            
            // Check Title
            if (normTitle) {
                if (seenTitles.has(normTitle)) {
                    duplicates.push({ type: 'Normalized Title', item1: p, item2: seenTitles.get(normTitle) });
                } else {
                    seenTitles.set(normTitle, p);
                }
            }
            
            // Check Image
            if (p.image_url) {
                if (seenImages.has(p.image_url)) {
                    duplicates.push({ type: 'Image URL', item1: p, item2: seenImages.get(p.image_url) });
                } else {
                    seenImages.set(p.image_url, p);
                }
            }
        }
        
        console.log(`\nFound ${duplicates.length} duplicate pairs/issues:`);
        if (duplicates.length > 0) {
            console.log(JSON.stringify(duplicates.slice(0, 15), null, 2));
        } else {
            console.log('No duplicates found in the products table!');
        }
        
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

findDuplicates();
