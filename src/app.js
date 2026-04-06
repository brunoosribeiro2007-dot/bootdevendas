const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const env = require('./config/env');

const app = express();

app.set('env', env);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Healthcheck (CRITICAL for Render)
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));

// Redireciona a raiz para o qr code
app.get('/', (req, res) => res.redirect('/qr'));

// Rota de visualização do QR Code / Pairing Code
app.get('/qr', (req, res) => {
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    
    if (whatsappPublisher.isReady) {
        return res.send(`
            <style>body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #121212; color: #fff; }</style>
            <h2 style="color: #4caf50;">✅ WhatsApp Conectado com Sucesso!</h2>
            <p>O bot do Mercado Livre já está rodando e publicando ofertas.</p>
        `);
    }

    // Se tivermos um código de pareamento, mostramos ele em destaque
    if (whatsappPublisher.latestPairingCode) {
        return res.send(`
            <meta http-equiv="refresh" content="10">
            <style>body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #121212; color: #fff; }</style>
            <h2>🔑 Seu Código de Pareamento:</h2>
            <h1 style="color: #4caf50; font-size: 60px; letter-spacing: 5px; background: #333; padding: 20px; display: inline-block; border-radius: 10px;">${whatsappPublisher.latestPairingCode}</h1>
            <p>1. No celular vá em: Configurações -> Dispositivos Conectados</p>
            <p>2. Clique em: "Conectar com número de telefone"</p>
            <p>3. Digite o código acima.</p>
            <hr style="width: 50%; border-color: #333;">
            <p>Status: ${whatsappPublisher.initStatus}</p>
        `);
    }

    // Se NÃO tivermos nada ainda (ou tiver QR mas quisermos código)
    return res.send(`
        <meta http-equiv="refresh" content="10">
        <style>body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #121212; color: #fff; }</style>
        
        <h2>📱 Conector do WhatsApp</h2>
        <p>Status: <strong>${whatsappPublisher.initStatus}</strong></p>

        <div style="background: #1e1e1e; padding: 20px; border-radius: 10px; width: 400px; margin: 30px auto; border: 1px solid #333;">
            <p>Se o QR Code abaixo não aparecer em 1 minuto, use o código:</p>
            <form method="POST" action="/qr">
                <input type="text" name="phone" placeholder="5511999998888" style="padding: 10px; border-radius: 5px; width: 220px; border: none; font-size: 16px;">
                <button type="submit" style="padding: 10px 15px; border-radius: 5px; background: #4caf50; border: none; color: white; cursor: pointer; font-weight: bold;">Gerar Código</button>
            </form>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">(Coloque código do país + DDD + número. Ex: 5511999998888)</p>
        </div>

        ${whatsappPublisher.latestQr ? `
            <div id="qrcode" style="padding: 20px; background: white; width: 256px; margin: 20px auto; border-radius: 10px;"></div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
            <script>
                new QRCode(document.getElementById("qrcode"), {
                    text: "${whatsappPublisher.latestQr}",
                    width: 256,
                    height: 256
                });
            </script>
        ` : '<h3>Aguardando QR Code...</h3>'}

        <div style="background: #1e1e1e; padding: 10px; border-radius: 5px; width: 80%; margin: 20px auto; text-align: left; font-size: 14px; color: #999;">
            <p style="margin: 0; color: #fff; border-bottom: 1px solid #333; padding-bottom: 5px;">Logs do Sistema:</p>
            ${whatsappPublisher.logs.map(log => `<p style="margin: 5px 0;">${log}</p>`).join('')}
        </div>

        <div style="margin-top: 30px;">
            <a href="/logout" style="color: #ff5252; text-decoration: none; font-size: 12px; border: 1px solid #ff5252; padding: 5px 10px; border-radius: 5px;">🛑 Erro de Conexão? Clique aqui para Resetar Sessão</a>
        </div>
    `);
});

// Endpoint POST para processar o pedido do Pairing Code
app.post('/qr', async (req, res) => {
    const { phone } = req.body;
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    
    if (phone) {
        await whatsappPublisher.triggerPairing(phone);
    }
    res.redirect('/qr');
});

// Endpoint para forçar logout e limpeza de sessão
app.get('/logout', async (req, res) => {
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    const { pool } = require('./database/init');
    const fs = require('fs');
    
    try {
        // Limpa banco
        if (pool) await pool.query('DELETE FROM sessions');
        
        // Limpa pasta local
        if (fs.existsSync(whatsappPublisher.authPath)) {
            fs.rmSync(whatsappPublisher.authPath, { recursive: true, force: true });
        }
        
        // Reinicia o motor
        whatsappPublisher.isReady = false;
        whatsappPublisher.initialize();
        
        res.send('Sessão limpa! Volte para <a href="/qr">/qr</a> para escanear novamente.');
    } catch (e) {
        res.status(500).send('Erro ao limpar sessão: ' + e.message);
    }
});

app.use('/api', routes);

module.exports = app;
