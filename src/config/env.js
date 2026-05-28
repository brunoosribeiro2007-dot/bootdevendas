require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || 'Cozinha, Jogo de Panelas, Frigideira antiaderente, Air fryer, Liquidificador, Cafeteira, Potes organizadores, Escorredor de louça, Garrafa térmica, Porta temperos, Tábua de corte, Mop giratório, Vassoura e rodo, Balde dobrável, Panos de microfibra, Escova multiuso, Aspirador de pó, Luvas de limpeza, Varal portátil, Cesto de roupa, Prendedores, Ferro de passar, Tábua de passar, Organizadores de roupa, Travesseiros, Jogos de cama, Cobertor, Cortinas, Tapetes, Caixas organizadoras, Organizador de gaveta, Nichos, Prateleiras, Carrinho organizador, Extensão elétrica, Filtro de linha, Lâmpada LED, Luminária, Ventilador, Toalhas, Tapete de banheiro, Suporte de parede, Espelho',
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
  initialCaptureDelay: 60000,
  publishStartTime: process.env.PUBLISH_START_TIME || '08:00',
  publishEndTime: process.env.PUBLISH_END_TIME || '22:00',
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || null,
};
