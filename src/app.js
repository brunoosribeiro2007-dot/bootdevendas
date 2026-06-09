const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const routes = require('./routes');
const env = require('./config/env');
const logger = require('./config/logger');

const app = express();

app.set('env', env);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Healthcheck (CRITICAL for Render)
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));

// Redireciona a raiz para o qr code
app.get('/', (req, res) => res.redirect('/qr'));

// Rota de visualização do dashboard premium
app.get('/qr', async (req, res) => {
    try {
        const html = fs.readFileSync(path.join(__dirname, 'views/dashboard.html'), 'utf8');
        res.send(html);
    } catch (e) {
        logger.error('Erro ao carregar o dashboard:', e);
        res.status(500).send('Erro ao carregar o dashboard.');
    }
});

// Endpoint POST para processar o pedido do Pairing Code
app.post('/qr', async (req, res) => {
    const { phone } = req.body;
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    
    logger.info(`🔍 Recebido pedido de pareamento. Body: ${JSON.stringify(req.body)}`);
    
    if (phone) {
        await whatsappPublisher.triggerPairing(phone);
    } else {
        logger.warn('⚠️ Telefone não recebido no formulário de pareamento.');
    }
    res.redirect('/qr');
});

// Endpoint para forçar logout e limpeza de sessão
app.get('/logout', async (req, res) => {
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    const { db } = require('./database/init');
    
    try {
        // Limpa banco (unificado)
        await db.run('DELETE FROM sessions', []);
        
        // Limpa pasta local
        if (fs.existsSync(whatsappPublisher.authPath)) {
            fs.rmSync(whatsappPublisher.authPath, { recursive: true, force: true });
        }
        
        // Reinicia o motor
        whatsappPublisher.isReady = false;
        whatsappPublisher.initialize();
        
        res.send(`
            <style>body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #0f172a; color: #fff; }</style>
            <h2>🛑 Sessão Encerrada</h2>
            <p>O banco de dados de sessões foi limpo e o motor reiniciado.</p>
            <p><a href="/qr" style="color: #0ea5e9;">Voltar para o Dashboard</a></p>
        `);
    } catch (e) {
        res.status(500).send('Erro ao limpar sessão: ' + e.message);
    }
});

// API Status Route para atualização em tempo real via AJAX
app.get('/api/status', async (req, res) => {
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    const QRCode = require('qrcode');
    
    let qrDataUrl = null;
    if (whatsappPublisher.latestQr) {
        try {
            qrDataUrl = await QRCode.toDataURL(whatsappPublisher.latestQr, { width: 400, margin: 2 });
        } catch (e) {
            // Ignore QR gen errors
        }
    }
    
    res.json({
        isReady: whatsappPublisher.isReady,
        initStatus: whatsappPublisher.initStatus,
        logs: whatsappPublisher.logs || [],
        latestPairingCode: whatsappPublisher.latestPairingCode,
        qrDataUrl: qrDataUrl,
        publishStartTime: env.publishStartTime || '08:00',
        publishEndTime: env.publishEndTime || '22:00',
    });
});

app.use('/api', routes);

module.exports = app;
