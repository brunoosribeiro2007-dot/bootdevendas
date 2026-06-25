require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || 'geladeira brastemp, geladeira electrolux, geladeira consul, cooktop fischer, cooktop brastemp, fogão dako, fogão electrolux, forno elétrico oster, forno elétrico philco, micro-ondas consul, micro-ondas brastemp, air fryer mondial, air fryer oster, air fryer philips walita, liquidificador oster, liquidificador mondial, batedeira arno, cafeteira oster, cafeteira tres coracoes, cafeteira dolce gusto, purificador de água consul, purificador de água ibbl, jogo de panelas tramontina, panela de pressão elétrica mondial, smart tv samsung, smart tv lg, smart tv tcl, soundbar samsung, ventilador arno, ar-condicionado midea, ar-condicionado split lg, máquina de lavar electrolux, máquina de lavar brastemp, aspirador pó robô xiaomi, secador cabelo taiff, escova secadora mondial, ferro de passar arno, adega de vinhos oster, cervejeira consul',
  mlCategory: process.env.ML_CATEGORY || '',
  cronCaptureSchedule: process.env.CRON_CAPTURE_SCHEDULE || '0 * * * *',
  cronPublishSchedule: process.env.CRON_PUBLISH_SCHEDULE || '*/3 * * * *',

  whatsappTargetNumber: process.env.WHATSAPP_TARGET_NUMBER || '5569984520192',
  whatsappTargetGroup: process.env.WHATSAPP_TARGET_GROUP || 'OfertaLar #17',
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

  shopeeAppId: process.env.SHOPEE_APP_ID || '',
  shopeeSecret: process.env.SHOPEE_SECRET || '',
  shopeeAffiliateTag: process.env.SHOPEE_AFFILIATE_TAG || '',
  useShopee: (process.env.USE_SHOPEE || 'true').toLowerCase() === 'true',
  historyPruneDays: parseInt(process.env.HISTORY_PRUNE_DAYS || '15', 10),
};

