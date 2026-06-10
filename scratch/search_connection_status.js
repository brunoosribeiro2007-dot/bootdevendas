const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function searchConnection() {
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

    const statusLogs = [];
    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const log = JSON.parse(line);
            const msg = log.message || '';
            if (msg.includes('Conexão') || msg.includes('Reconect') || msg.includes('QR Code') || msg.includes('indisponível') || msg.includes('motor') || msg.includes('Timeout')) {
                statusLogs.push(`[${log.timestamp}] ${msg}`);
            }
        } catch (e) {}
    }
    
    console.log(`Total connection-related logs: ${statusLogs.length}`);
    console.log('Last 30 connection status logs:');
    const last30 = statusLogs.slice(-30);
    for (const log of last30) {
        console.log(log);
    }
}

searchConnection();
