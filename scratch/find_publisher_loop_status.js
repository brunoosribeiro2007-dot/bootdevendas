const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function checkPublisherLoop() {
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

    const loopLogs = [];
    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const log = JSON.parse(line);
            const msg = log.message || '';
            if (msg.includes('ciclo') || msg.includes('Aguardando') || msg.includes('Fila vazia') || msg.includes('Intervalo seguro') || msg.includes('publicado com sucesso') || msg.includes('Falha ao publicar') || msg.includes('Pausando o bot')) {
                loopLogs.push(`[${log.timestamp}] [${log.level.toUpperCase()}] ${msg}`);
            }
        } catch (e) {}
    }
    
    console.log(`Total publisher loop logs: ${loopLogs.length}`);
    console.log('Last 50 publisher loop logs:');
    const last50 = loopLogs.slice(-50);
    for (const log of last50) {
        console.log(log);
    }
}

checkPublisherLoop();
