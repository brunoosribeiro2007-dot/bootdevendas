require('dotenv').config();
const { getNicheProfile, normalizeNicheId } = require('./niches');

const activeNicheId = normalizeNicheId(process.env.NICHE);
const nicheProfile = getNicheProfile(activeNicheId);

module.exports = {
  niche: activeNicheId,
  isMultiNiche: activeNicheId === 'multi' || Boolean(process.env.WHATSAPP_GROUP_CASA && process.env.WHATSAPP_GROUP_PC_GAMER),
  enableSeedProducts: (process.env.ENABLE_SEED_PRODUCTS || 'false').toLowerCase() === 'true',
  nicheProfile,
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || nicheProfile.searchKeywords.join(', '),
  mlCategory: process.env.ML_CATEGORY || '',
  cronCaptureSchedule: process.env.CRON_CAPTURE_SCHEDULE || '0 * * * *',
  cronPublishSchedule: process.env.CRON_PUBLISH_SCHEDULE || '*/3 * * * *',

  whatsappTargetNumber: process.env.WHATSAPP_TARGET_NUMBER || '5569984520192',
  whatsappTargetGroup: process.env.WHATSAPP_TARGET_GROUP || '',
  whatsappTargetChannel: process.env.WHATSAPP_TARGET_CHANNEL || '',
  whatsappApiUrl: process.env.WHATSAPP_API_URL || '',

  // Destinos específicos por nicho (para instância única multi-grupos)
  whatsappGroupCasa: process.env.WHATSAPP_GROUP_CASA || '',
  whatsappChannelCasa: process.env.WHATSAPP_CHANNEL_CASA || '',
  whatsappGroupPcGamer: process.env.WHATSAPP_GROUP_PC_GAMER || '',
  whatsappChannelPcGamer: process.env.WHATSAPP_CHANNEL_PC_GAMER || '',

  mlAffiliateTag: process.env.ML_AFFILIATE_TAG || 'bv20260330080614',
  useMlAffiliateApi: (process.env.ML_USE_AFFILIATE_API || 'false').toLowerCase() === 'true',
  mlAffiliateApiUrl: process.env.ML_AFFILIATE_API_URL || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
  useMlAffiliateUi: (process.env.ML_USE_MELI_UI || 'false').toLowerCase() === 'true',
  mlCookiesPath: process.env.ML_COOKIES_PATH || './.ml_cookies.json',
  mlCookieString: process.env.ML_COOKIE_STRING || '',
  initialCaptureDelay: 60000,
  publishStartTime: process.env.PUBLISH_START_TIME || '08:00',
  publishEndTime: process.env.PUBLISH_END_TIME || '22:00',
  goodNightMessage: process.env.GOOD_NIGHT_MESSAGE ? process.env.GOOD_NIGHT_MESSAGE.replace(/\\n/g, '\n') : null,
  goodNightMessageCasa: process.env.GOOD_NIGHT_MESSAGE_CASA ? process.env.GOOD_NIGHT_MESSAGE_CASA.replace(/\\n/g, '\n') : null,
  goodNightMessagePcGamer: process.env.GOOD_NIGHT_MESSAGE_PC_GAMER ? process.env.GOOD_NIGHT_MESSAGE_PC_GAMER.replace(/\\n/g, '\n') : null,
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || null,

  // Configurações do Módulo de IA Gemini
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Parâmetros de Afiliado Mercado Livre & Amazon
  mlAccessToken: process.env.ML_ACCESS_TOKEN || '',
  mlMattTool: process.env.ML_MATT_TOOL || process.env.ML_AFFILIATE_TAG || 'bv20260330080614',
  mlMattWord: process.env.ML_MATT_WORD || '',
  amazonPartnerTag: process.env.AMAZON_PARTNER_TAG || process.env.AMAZON_TAG || '',

  // Configurações do Módulo de Marca d'Água e Postagem
  watermarkPath: process.env.WATERMARK_PATH || '',
  defaultStoreName: process.env.DEFAULT_STORE_NAME || nicheProfile.defaultStoreName,

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
  minDiscountPercent: parseFloat(process.env.MIN_DISCOUNT_PERCENT || String(nicheProfile.minDiscountPercent)),
  requireTrustedSeller: (process.env.REQUIRE_TRUSTED_SELLER || 'true').toLowerCase() === 'true',

  // 🛡️ Credenciais Oficiais OAuth 2.0 Mercado Livre
  mlClientId: process.env.ML_CLIENT_ID || '7921110595606583',
  mlClientSecret: process.env.ML_CLIENT_SECRET || '1Hzeh0kF7u5OXli5cqp9Bsg3zyMZdOPI',
  mlRedirectUri: process.env.ML_REDIRECT_URI || 'https://ml-afiliados-bot-f1w7.onrender.com/auth/callback',
  mlRefreshToken: process.env.ML_REFRESH_TOKEN || null,
  webhookSecret: process.env.WEBHOOK_SECRET || null,
};
