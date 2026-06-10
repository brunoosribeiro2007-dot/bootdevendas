const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function findCamera() {
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

    const matches = [];
    for await (const line of rl) {
        if (line.includes('Câmera De Segurança Ip Wi-fi Lâmpada E27') || line.includes('Câmera de Segurança Ip Wi-fi Lâmpada E27') || line.includes('Câmera De Segurança Ip Wi-fi Lâmpada') || line.includes('Câmera de Segurança') || line.includes('IP Wi-Fi Lâmpada')) {
            matches.push(line);
        }
    }
    
    console.log(`Found ${matches.length} lines:`);
    for (const m of matches) {
        console.log(m);
    }
}

findCamera();
