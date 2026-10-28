/**
 * ==============================================================================
 * APP.JS - CONFIGURAÇÃO DO SERVIDOR EXPRESS E ROTAS PRINCIPAIS
 * ==============================================================================
 * Responsabilidades deste módulo:
 * 1. Configurar middlewares essenciais (CORS, JSON Parser, etc.).
 * 2. Disponibilizar a rota de Healthcheck (/health) para o Render (pública).
 * 3. Autenticação baseada em sessão com cookies assinados (HMAC-SHA256).
 * 4. Tela de Login moderna e responsiva (/login) e Logout (/logout).
 * 5. Servir o painel web administrativo do Dashboard (/qr e ações do WhatsApp).
 * 6. Conectar o roteador de APIs (/api).
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
// BLOCO 2: HEALTHCHECK (CRÍTICO PARA O RENDER - SEMPRE PÚBLICO)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Endpoint de monitoramento de saúde.
 * Retorna status 200 para validar que o container está ativo e responsivo.
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 3: SISTEMA DE AUTENTICAÇÃO E SESSÃO (ADMIN_USER & ADMIN_PASS)
// ──────────────────────────────────────────────────────────────────────────────

const ADMIN_USER = process.env.ADMIN_USER || process.env.DASHBOARD_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.DASHBOARD_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_PASS || 'affiliate_secret_hmac_key_2026';
const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Cria token de sessão HMAC-SHA256 assinado
 */
function createSessionToken(username) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const payload = `${username}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/**
 * Valida o token de sessão e verifica se não expirou
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  try {
    const payload = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    
    const [username, expiresAtStr] = payload.split(':');
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return null;
    }
    return { username, expiresAt };
  } catch (e) {
    return null;
  }
}

/**
 * Parser leve de cookies HTTP
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const items = cookieHeader.split(';');
  for (const item of items) {
    const idx = item.indexOf('=');
    if (idx !== -1) {
      const key = item.substring(0, idx).trim();
      const val = item.substring(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

/**
 * Define o cookie de sessão seguro no navegador
 */
function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAgeSec = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const flags = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (isProd) {
    flags.push('Secure');
  }
  res.setHeader('Set-Cookie', flags.join('; '));
}

/**
 * Remove o cookie de sessão
 */
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/**
 * Middleware central de autenticação
 */
const authMiddleware = (req, res, next) => {
  // 1. Rotas estritamente públicas
  if (req.path === '/health' || req.path === '/login') {
    return next();
  }

  // 2. Verificar sessão válida via cookie
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  const session = verifySessionToken(sessionToken);

  if (session) {
    req.user = session.username;
    return next();
  }

  // 3. Fallback: HTTP Basic Auth (para cURL, scripts e automações externas)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const creds = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
      const u = creds[0];
      const p = creds[1];
      if (u === ADMIN_USER && p === ADMIN_PASS) {
        req.user = u;
        return next();
      }
    } catch (e) {
      // Ignora erro no header
    }
  }

  // 4. Usuário não autenticado
  const isApi = req.path.startsWith('/api') || 
                (req.headers.accept && req.headers.accept.includes('application/json')) ||
                (req.headers['x-requested-with'] === 'XMLHttpRequest');

  if (isApi) {
    return res.status(401).json({ error: 'Acesso não autorizado. Por favor, inicie sessão.' });
  }

  return res.redirect('/login');
};

// ──────────────────────────────────────────────────────────────────────────────
// ROTAS DE LOGIN E LOGOUT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Exibe a página de login
 */
app.get('/login', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
  if (session) {
    return res.redirect('/qr');
  }
  try {
    const html = fs.readFileSync(path.join(__dirname, 'views/login.html'), 'utf8');
    res.send(html);
  } catch (e) {
    logger.error('Erro ao renderizar tela de login:', e);
    res.status(500).send('Erro ao carregar página de login.');
  }
});

/**
 * Processa a autenticação de login (aceita JSON e formulário nativo)
 */
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const isJsonRequest = req.is('json') || (req.headers.accept && req.headers.accept.includes('application/json'));

  const validUser = (username || '').trim() === ADMIN_USER;
  const validPass = (password || '') === ADMIN_PASS;

  if (validUser && validPass) {
    const token = createSessionToken(username.trim());
    setSessionCookie(res, token);
    logger.info(`🔐 Login realizado com sucesso para o utilizador: "${username.trim()}"`);

    if (isJsonRequest) {
      return res.json({ success: true, redirect: '/qr' });
    }
    return res.redirect('/qr');
  }

  logger.warn(`⚠️ Falha de login para o utilizador: "${username || 'não informado'}"`);

  if (isJsonRequest) {
    return res.status(401).json({ 
      success: false, 
      error: 'Nome de utilizador ou palavra-passe incorretos.' 
    });
  }

  return res.redirect('/login?error=1');
});

/**
 * Encerra a sessão do utilizador
 */
app.get('/logout', (req, res) => {
  clearSessionCookie(res);
  logger.info('👋 Sessão do utilizador encerrada.');
  res.redirect('/login');
});

// Aplica autenticação a todas as rotas subsequentes
app.use(authMiddleware);

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
app.get('/whatsapp/reset', async (req, res) => {
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
      <h2>🛑 WhatsApp Reiniciado com Sucesso</h2>
      <p>O banco de dados de sessões do WhatsApp foi limpo e o motor reiniciado.</p>
      <p><a href="/qr" style="color: #0ea5e9;">Voltar para o Dashboard</a></p>
    `);
  } catch (e) {
    res.status(500).send('Erro ao limpar sessão do WhatsApp: ' + e.message);
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

  let destination = null;
  try {
    destination = await whatsappPublisher.getDestinationInfo();
  } catch (e) {}

  res.json({
    isReady: whatsappPublisher.isReady,
    initStatus: whatsappPublisher.initStatus,
    logs: whatsappPublisher.logs || [],
    latestPairingCode: whatsappPublisher.latestPairingCode,
    qrDataUrl: qrDataUrl,
    publishStartTime: env.publishStartTime || '08:00',
    publishEndTime: env.publishEndTime || '22:00',
    destination: destination || {
      name: env.whatsappTargetChannel || env.whatsappTargetGroup || env.whatsappTargetNumber || 'Não definido',
      type: env.whatsappTargetChannel ? 'channel' : (env.whatsappTargetGroup ? 'group' : 'number')
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 5: ROTEADOR DE APIS DO SISTEMA
// ──────────────────────────────────────────────────────────────────────────────

app.use('/api', routes);

module.exports = app;
