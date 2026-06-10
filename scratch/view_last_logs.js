const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function viewLastLogs() {
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

    const lines = [];
    for await (const line of rl) {
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length > 100) {
            lines.shift();
        }
    }
    
    console.log('Last 100 lines of combined.log:');
    for (const l of lines) {
        console.log(l);
    }
}

viewLastLogs();
