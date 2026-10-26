/**
 * ==============================================================================
 * APP.JS - CONFIGURAÇÃO DO SERVIDOR EXPRESS E ROTAS PRINCIPAIS
 * ==============================================================================
 * Responsabilidades deste módulo:
 * 1. Configurar middlewares essenciais (CORS, JSON Parser, etc.).
 * 2. Disponibilizar a rota de Healthcheck (/health) para o Render.
 * 3. Aplicar autenticação básica (HTTP Basic Auth) caso configurada.
 * 4. Servir o painel web administrativo do Dashboard (/qr e ações do WhatsApp).
 * 5. Conectar o roteador de APIs (/api).
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const routes = require('./routes');
const env = require('./config/env');
const logger = require('./config/logger');

const app = express();

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: MIDDLEWARES BÁSICOS
// ──────────────────────────────────────────────────────────────────────────────

app.set('env', env);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: HEALTHCHECK (CRÍTICO PARA O RENDER)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Endpoint de monitoramento de saúde.
 * Retorna status 200 para validar que o container está ativo e responsivo.
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 3: MIDDLEWARE DE AUTENTICAÇÃO BÁSICA
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Protege o painel administrativo e as APIs caso DASHBOARD_PASSWORD esteja configurado.
 */
const basicAuthMiddleware = (req, res, next) => {
  const username = process.env.DASHBOARD_USERNAME || 'admin';
  const password = process.env.DASHBOARD_PASSWORD;

  // Se nenhuma senha estiver definida no ambiente, permite acesso livre
  if (!password) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Affiliate Engine Dashboard"');
    return res.status(401).send('Acesso não autorizado. Autenticação básica requerida.');
  }

  try {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    if (user === username && pass === password) {
      return next();
    }
  } catch (e) {
    // Header malformado
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Affiliate Engine Dashboard"');
  return res.status(401).send('Credenciais inválidas.');
};

app.use(basicAuthMiddleware);

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 4: ROTAS DO DASHBOARD E GERENCIAMENTO DO WHATSAPP
// ──────────────────────────────────────────────────────────────────────────────

// Redireciona raiz para o painel de pareamento/status
app.get('/', (req, res) => res.redirect('/qr'));

/**
 * Exibe o HTML do Dashboard administrativo com status do robô e pareamento WhatsApp.
 */
app.get('/qr', async (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'views/dashboard.html'), 'utf8');
    res.send(html);
  } catch (e) {
    logger.error('Erro ao carregar o dashboard:', e);
    res.status(500).send('Erro ao carregar o dashboard.');
  }
});

/**
 * Processa a solicitação de pareamento por código de 8 dígitos (Pairing Code).
 */
app.post('/qr', async (req, res) => {
  const { phone } = req.body;
  const whatsappPublisher = require('./publishers/whatsapp.publisher');

  logger.info(`🔍 Recebido pedido de pareamento para o telefone: ${phone || 'não informado'}`);

  if (phone) {
    await whatsappPublisher.triggerPairing(phone);
  } else {
    logger.warn('⚠️ Telefone não recebido no formulário de pareamento.');
  }
  res.redirect('/qr');
});

/**
 * Encerra a sessão ativa do WhatsApp, limpa credenciais salvas e reinicia o motor.
 */
app.get('/logout', async (req, res) => {
  const whatsappPublisher = require('./publishers/whatsapp.publisher');
  const { db } = require('./database/init');

  try {
    // Limpa a tabela de sessões do banco de dados
    await db.run('DELETE FROM sessions', []);

    // Limpa os arquivos da pasta local de autenticação
    if (fs.existsSync(whatsappPublisher.authPath)) {
      fs.rmSync(whatsappPublisher.authPath, { recursive: true, force: true });
    }

    // Reinicia o motor do WhatsApp para gerar novo QR Code
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

/**
 * Endpoint de telemetria consumido via AJAX pelo Dashboard para atualização em tempo real.
 */
app.get('/api/status', async (req, res) => {
  const whatsappPublisher = require('./publishers/whatsapp.publisher');

  let qrDataUrl = null;
  if (whatsappPublisher.latestQr) {
    try {
      qrDataUrl = await QRCode.toDataURL(whatsappPublisher.latestQr, { width: 400, margin: 2 });
    } catch (e) {
      // Ignora erro de renderização do QR
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

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 5: ROTEADOR DE APIS DO SISTEMA
// ──────────────────────────────────────────────────────────────────────────────

app.use('/api', routes);

module.exports = app;
