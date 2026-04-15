require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || 'geladeira, fogão, máquina de lavar, sofá, guarda-roupa, mesa de jantar, sabão líquido, amaciante, eletrodomésticos, móveis',
  mlCategory: process.env.ML_CATEGORY || '',
  cronCaptureSchedule: process.env.CRON_CAPTURE_SCHEDULE || '0 */2 * * *', // A cada 2 horas para evitar ban
  cronPublishSchedule: process.env.CRON_PUBLISH_SCHEDULE || '*/30 * * * *', // A cada 30 min

  whatsappTargetNumber: process.env.WHATSAPP_TARGET_NUMBER || '5569984520192',
  whatsappTargetGroup: process.env.WHATSAPP_TARGET_GROUP || 'ofertas do dia',
  mlAffiliateTag: process.env.ML_AFFILIATE_TAG || 'bv20260330080614',
  initialCaptureDelay: 10000,
};
