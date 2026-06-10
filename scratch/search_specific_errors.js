const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function searchErrors() {
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

    let count = 0;
    for await (const line of rl) {
        if (line.includes('WhatsApp') || line.includes('mensagem') || line.includes('imagem') || line.includes('destino') || line.includes('dest')) {
            console.log(line);
            count++;
            if (count > 20) {
                console.log('... truncated ...');
                break;
            }
        }
    }
    console.log(`Found ${count} lines`);
}

searchErrors();
