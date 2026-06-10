const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function analyzeCombined() {
    const combinedLogPath = path.join(__dirname, '..', 'logs', 'combined.log');
    if (!fs.existsSync(combinedLogPath)) {
        console.log('combined.log does not exist');
        return;
    }

    const fileStream = fs.createReadStream(combinedLogPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const window = [];
    const contextSize = 5;
    let matchCount = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;
        window.push(line);
        if (window.length > contextSize + 1) {
            window.shift();
        }

        if (line.includes('Falha ao publicar item')) {
            matchCount++;
            console.log(`\n=== MATCH #${matchCount} ===`);
            for (let i = 0; i < window.length; i++) {
                try {
                    const log = JSON.parse(window[i]);
                    console.log(`[${log.level.toUpperCase()}][${log.timestamp}] ${log.message}`);
                } catch (e) {
                    console.log(`[RAW] ${window[i]}`);
                }
            }
            if (matchCount >= 10) break;
        }
    }
}

analyzeCombined();
