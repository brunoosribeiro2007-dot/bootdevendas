const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function analyzeLogs() {
    const errorLogPath = path.join(__dirname, '..', 'logs', 'error.log');
    if (!fs.existsSync(errorLogPath)) {
        console.log('error.log does not exist');
        return;
    }

    const fileStream = fs.createReadStream(errorLogPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const errorCounts = {};
    const recentErrors = [];

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const log = JSON.parse(line);
            const msg = log.message || '';
            
            // Clean up variable parts like numbers/keywords to group them
            let groupKey = msg
                .replace(/item \d+/g, 'item [ID]')
                .replace(/"[^"]+"/g, '[KEYWORD]')
                .replace(/'[^']+'/g, '[KEYWORD]')
                .replace(/Status \d+/g, 'Status [CODE]');
            
            errorCounts[groupKey] = (errorCounts[groupKey] || 0) + 1;
            
            recentErrors.push({
                timestamp: log.timestamp,
                message: log.message,
                stack: log.stack
            });
        } catch (e) {
            // Not JSON or parse error
            const rawMsg = line.substring(0, 100);
            errorCounts[`[RAW] ${rawMsg}`] = (errorCounts[`[RAW] ${rawMsg}`] || 0) + 1;
        }
    }

    console.log('=== UNIQUE ERRORS AND COUNTS ===');
    const sortedErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]);
    for (const [err, count] of sortedErrors) {
        console.log(`[${count}x] ${err}`);
    }

    console.log('\n=== LAST 15 ERRORS IN DETAIL ===');
    const last15 = recentErrors.slice(-15);
    for (const err of last15) {
        console.log(`[${err.timestamp}] ${err.message}`);
        if (err.stack) console.log(err.stack);
        console.log('----------------------------');
    }
}

analyzeLogs();
