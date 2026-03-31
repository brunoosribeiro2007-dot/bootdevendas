const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const env = require('./config/env');

const app = express();

app.set('env', env);
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

const whatsappPublisher = require('./publishers/whatsapp.publisher');

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// QR Code Endpoint
app.get('/qr', (req, res) => {
    if (whatsappPublisher.isReady) {
        return res.send('<h2>O WhatsApp já está conectado!</h2><p>Nenhuma ação necessária.</p>');
    }

    if (!whatsappPublisher.latestQr) {
        return res.send(`
            <meta http-equiv="refresh" content="5">
            <h2>Aguardando geração do QR Code...</h2>
            <p>A página irá recarregar automaticamente em 5 segundos.</p>
        `);
    }

    const html = `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QR Code do WhatsApp Bot</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; background: #121212; color: #fff; }
                #qrcode { display: flex; justify-content: center; margin-top: 20px; background: white; padding: 20px; border-radius: 10px; width: fit-content; margin: 20px auto; }
            </style>
        </head>
        <body>
            <h1>Escaneie o QR Code no seu WhatsApp</h1>
            <p>Se o QR Code sumir ou o WhatsApp for conectado, a página irá recarregar automaticamente.</p>
            <div id="qrcode"></div>
            
            <script>
                new QRCode(document.getElementById("qrcode"), {
                    text: "${whatsappPublisher.latestQr}",
                    width: 256,
                    height: 256
                });

                // Dica: Se o QR Code expirar, você pode recarregar a página manualmente no botão do navegador
                console.log('Esperando o escaneamento na nuvem...');
            </script>
        </body>
        </html>
    `;
    res.send(html);
});

module.exports = app;
