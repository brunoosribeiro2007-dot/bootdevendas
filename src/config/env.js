require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || 'geladeira, cooktop, fogão, forno elétrico, micro-ondas, air fryer, liquidificador, batedeira, cafeteira, purificador de água, jogo de panelas, panela de pressão elétrica, smart tv, soundbar, ventilador, ar-condicionado, máquina de lavar, aspirador pó robô, ferro de passar, adega de vinhos, cervejeira',
  mlCategory: process.env.ML_CATEGORY || '',
  cronCaptureSchedule: process.env.CRON_CAPTURE_SCHEDULE || '0 * * * *',
  cronPublishSchedule: process.env.CRON_PUBLISH_SCHEDULE || '*/3 * * * *',

  whatsappTargetNumber: process.env.WHATSAPP_TARGET_NUMBER || '5569984520192',
  whatsappTargetGroup: process.env.WHATSAPP_TARGET_GROUP || '',
  whatsappTargetChannel: process.env.WHATSAPP_TARGET_CHANNEL || '',
  whatsappApiUrl: process.env.WHATSAPP_API_URL || '',

  mlAffiliateTag: process.env.ML_AFFILIATE_TAG || 'bv20260330080614',
  useMlAffiliateApi: (process.env.ML_USE_AFFILIATE_API || 'false').toLowerCase() === 'true',
  mlAffiliateApiUrl: process.env.ML_AFFILIATE_API_URL || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
  useMlAffiliateUi: (process.env.ML_USE_MELI_UI || 'false').toLowerCase() === 'true',
  mlCookiesPath: process.env.ML_COOKIES_PATH || './.ml_cookies.json',
  mlCookieString: process.env.ML_COOKIE_STRING || '',
  initialCaptureDelay: 60000,
  publishStartTime: process.env.PUBLISH_START_TIME || '08:00',
  publishEndTime: process.env.PUBLISH_END_TIME || '22:00',
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || null,

  // Configurações do Módulo de IA Gemini
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Configurações do Módulo de Marca d'Água e Postagem
  watermarkPath: process.env.WATERMARK_PATH || '',
  defaultStoreName: process.env.DEFAULT_STORE_NAME || 'Oferta no Mercado Livre',

  shopeeAppId: process.env.SHOPEE_APP_ID || '',
  shopeeSecret: process.env.SHOPEE_SECRET || '',
  shopeeAffiliateTag: process.env.SHOPEE_AFFILIATE_TAG || '',
  useShopee: (process.env.USE_SHOPEE || 'true').toLowerCase() === 'true',
  historyPruneDays: parseInt(process.env.HISTORY_PRUNE_DAYS || '3', 10),

  // Credenciais de Acesso ao Painel Administrativo
  adminUser: process.env.ADMIN_USER || process.env.DASHBOARD_USERNAME || 'admin',
  adminPass: process.env.ADMIN_PASS || process.env.DASHBOARD_PASSWORD || 'admin123',
  sessionSecret: process.env.SESSION_SECRET || 'affiliate_secret_hmac_key_2026',

  // Critérios de Qualidade e Reputação de Ofertas (Busca Automática)
  minReviews: parseInt(process.env.MIN_REVIEWS || process.env.MIN_PRODUCT_REVIEWS || '100', 10),
  minRating: parseFloat(process.env.MIN_RATING || process.env.MIN_PRODUCT_RATING || '4.5'),
  minDiscountPercent: parseFloat(process.env.MIN_DISCOUNT_PERCENT || '5'),
  requireTrustedSeller: (process.env.REQUIRE_TRUSTED_SELLER || 'true').toLowerCase() === 'true',

  // 🛡️ Credenciais Oficiais OAuth 2.0 Mercado Livre
  mlClientId: process.env.ML_CLIENT_ID || '7921110595606583',
  mlClientSecret: process.env.ML_CLIENT_SECRET || '1Hzeh0kF7u5OXli5cqp9Bsg3zyMZdOPI',
  mlRedirectUri: process.env.ML_REDIRECT_URI || 'https://ml-afiliados-bot-f1w7.onrender.com/auth/callback',
  webhookSecret: process.env.WEBHOOK_SECRET || null,
};
