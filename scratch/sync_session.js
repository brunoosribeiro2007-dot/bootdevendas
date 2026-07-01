const fs = require('fs');
const path = require('path');
const { initializeDB, saveSessionFile } = require('../src/database/init');
const logger = require('../src/config/logger');

async function sync() {
    console.log('=== SYNC SESSION START ===');
    const authPath = path.resolve(process.cwd(), '.baileys_auth');
    
    if (!fs.existsSync(authPath)) {
        console.error('❌ Local .baileys_auth folder not found!');
        return;
    }
    
    const files = fs.readdirSync(authPath);
    if (files.length === 0) {
        console.error('❌ No session files found in .baileys_auth!');
        return;
    }
    
    console.log(`Found ${files.length} session files locally. Preparing bundle...`);
    
    try {
        await initializeDB();
        
        const bundle = {};
        for (const file of files) {
            const filePath = path.join(authPath, file);
            if (fs.lstatSync(filePath).isFile()) {
                const data = fs.readFileSync(filePath);
                bundle[file] = data.toString('base64');
            }
        }

        const serialized = JSON.stringify(bundle);
        const compressed = Buffer.from(serialized, 'utf-8');

        console.log('Uploading session bundle to Supabase...');
        await saveSessionFile('session_bundle', compressed);
        console.log('✅ WhatsApp session successfully synced to Supabase!');
    } catch (err) {
        console.error('❌ Sync failed:', err);
    }
    console.log('=== SYNC SESSION END ===');
}

sync();
