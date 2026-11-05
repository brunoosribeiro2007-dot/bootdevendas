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
// BLOCO 3: SISTEMA DE AUTENTICAÇÃO, CADASTRO LIVRE E SESSÃO SEGURA
// ──────────────────────────────────────────────────────────────────────────────

const repository = require('./database/repository');

const ADMIN_USER = process.env.ADMIN_USER || process.env.DASHBOARD_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.DASHBOARD_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || ADMIN_PASS || 'affiliate_secret_hmac_key_2026';
const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Cria hash criptográfico para senha usando scrypt
 */
function hashPassword(password) {
  const salt = 'ml_affiliate_salt_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

/**
 * Verifica se a senha corresponde ao hash salvo
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  try {
    const salt = 'ml_affiliate_salt_2026';
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(hash);
    const b = Buffer.from(storedHash);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

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
const authMiddleware = async (req, res, next) => {
  // 1. Rotas estritamente públicas
  if (req.path === '/health' || req.path === '/login' || req.path === '/register' || req.path === '/api/auth/status') {
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
      const u = creds[0].trim().toLowerCase();
      const p = creds[1];

      // Testa no banco
      const user = await repository.getUserByEmail(u);
      if (user && user.passwordHash && verifyPassword(p, user.passwordHash)) {
        req.user = user.email;
        return next();
      }

      // Fallback para variáveis de ambiente
      if (u === ADMIN_USER.toLowerCase() && p === ADMIN_PASS) {
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
// ROTAS DE LOGIN, CADASTRO LIVRE E LOGOUT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retorna status da autenticação (se já existe usuário ou se é primeiro acesso)
 */
app.get('/api/auth/status', async (req, res) => {
  try {
    const totalUsers = await repository.countUsers();
    res.json({ hasUsers: totalUsers > 0, count: totalUsers });
  } catch (err) {
    res.json({ hasUsers: false, count: 0 });
  }
});

/**
 * Exibe a página de login / cadastro
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
 * Processa a autenticação de login (aceita e-mail/usuário e senha)
 */
app.post('/login', async (req, res) => {
  const { username, email, password } = req.body;
  const isJsonRequest = req.is('json') || (req.headers.accept && req.headers.accept.includes('application/json'));

  const identifier = (username || email || '').trim().toLowerCase();
  const inputPass = password || '';

  if (!identifier || !inputPass) {
    const error = 'Por favor, informe seu usuário/e-mail e sua senha.';
    if (isJsonRequest) return res.status(400).json({ success: false, error });
    return res.redirect('/login?error=1');
  }

  let isAuthenticated = false;
  let loggedUser = identifier;

  // 1. Busca usuário cadastrado no banco de dados
  try {
    const user = await repository.getUserByEmail(identifier);
    if (user && user.passwordHash) {
      if (verifyPassword(inputPass, user.passwordHash)) {
        isAuthenticated = true;
        loggedUser = user.email;
      }
    }
  } catch (err) {
    logger.warn('Erro ao consultar usuário no banco durante login:', err.message);
  }

  // 2. Fallback para variáveis de ambiente (.env) caso ainda não haja usuário
  if (!isAuthenticated) {
    const envUser = (ADMIN_USER || '').trim().toLowerCase();
    if (identifier === envUser && inputPass === ADMIN_PASS) {
      isAuthenticated = true;
      loggedUser = envUser;
      try {
        await repository.saveOrUpdateUser(loggedUser, hashPassword(inputPass));
      } catch (e) {}
    }
  }

  if (isAuthenticated) {
    const token = createSessionToken(loggedUser);
    setSessionCookie(res, token);
    logger.info(`🔐 Login realizado com sucesso para o utilizador: "${loggedUser}"`);

    if (isJsonRequest) {
      return res.json({ success: true, redirect: '/qr', user: loggedUser });
    }
    return res.redirect('/qr');
  }

  logger.warn(`⚠️ Falha de login para o utilizador: "${identifier}"`);

  if (isJsonRequest) {
    return res.status(401).json({ 
      success: false, 
      error: 'Credenciais incorretas. Caso ainda não tenha cadastro, cadastre-se na aba Cadastrar.' 
    });
  }

  return res.redirect('/login?error=1');
});

/**
 * Processa o cadastro de novo usuário / administrador
 */
app.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  const isJsonRequest = req.is('json') || (req.headers.accept && req.headers.accept.includes('application/json'));

  const identifier = (username || email || '').trim().toLowerCase();

  if (!identifier || identifier.length < 3) {
    const error = 'O nome de usuário ou e-mail deve ter no mínimo 3 caracteres.';
    if (isJsonRequest) return res.status(400).json({ success: false, error });
    return res.redirect('/login?error_register=' + encodeURIComponent(error));
  }

  if (!password || password.length < 6) {
    const error = 'A senha deve conter no mínimo 6 caracteres.';
    if (isJsonRequest) return res.status(400).json({ success: false, error });
    return res.redirect('/login?error_register=' + encodeURIComponent(error));
  }

  if (confirmPassword && password !== confirmPassword) {
    const error = 'As senhas informadas não coincidem.';
    if (isJsonRequest) return res.status(400).json({ success: false, error });
    return res.redirect('/login?error_register=' + encodeURIComponent(error));
  }

  try {
    const existing = await repository.getUserByEmail(identifier);
    if (existing) {
      const error = 'Este usuário/e-mail já está cadastrado. Por favor, faça login.';
      if (isJsonRequest) return res.status(409).json({ success: false, error });
      return res.redirect('/login?error_register=' + encodeURIComponent(error));
    }

    const hashed = hashPassword(password);
    await repository.saveOrUpdateUser(identifier, hashed, 'admin');
    logger.info(`✨ Novo usuário cadastrado com sucesso: "${identifier}"`);

    // Inicia sessão imediatamente
    const token = createSessionToken(identifier);
    setSessionCookie(res, token);

    if (isJsonRequest) {
      return res.json({ success: true, redirect: '/qr', user: identifier });
    }
    return res.redirect('/qr');
  } catch (err) {
    logger.error('Erro ao cadastrar novo usuário:', err);
    const error = 'Erro ao cadastrar usuário. Tente novamente.';
    if (isJsonRequest) return res.status(500).json({ success: false, error });
    return res.redirect('/login?error_register=' + encodeURIComponent(error));
  }
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

  try {
    await whatsappPublisher.disconnectAndResetSession();

    res.send(`
      <style>body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #0f172a; color: #fff; }</style>
      <h2>🛑 WhatsApp Reiniciado com Sucesso</h2>
      <p>A sessão anterior foi limpa e o motor reiniciado. Um novo QR Code limpo está disponível.</p>
      <p><a href="/qr" style="color: #0ea5e9; font-weight: bold; font-size: 1.1rem;">👉 Ir para o QR Code</a></p>
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
