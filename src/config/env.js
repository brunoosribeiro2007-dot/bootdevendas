require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || 'Panelas, frigideiras, Talheres, pratos, copos, Air Fryer, Liquidificador, Micro-ondas, Cafeteira, Potes herméticos, Porta temperos, Tábua de corte, Vassoura, Rodo, Mop esfregão, Balde, Panos de limpeza, Sabão líquido, Detergente, Desinfetante, Água sanitária, Amaciante, Esponjas, Luvas de limpeza, Máquina de lavar, Varal, Ferro de passar, Tábua de passar, Cesto de roupa, Organizadores de roupa, Sofá, Rack painel TV, Televisão, Tapete sala, Cortina, Ventilador, Cama colchão, Travesseiros, Lençóis, Cobertores, Guarda-roupa, Cabides, Chuveiro, Toalhas banho, Tapete de banheiro, Lixeira banheiro, Espelho banheiro, Porta sabonete, Caixas organizadoras, Organizadores de gaveta, Prateleiras, Nichos parede, Carrinho com rodinhas, Quadros decorativos, Luminárias decorativas, Plantas artificiais, Espelhos decorativos, Velas decorativas, Almofadas, Cortinas estilizadas, Tapetes decorativos',
  mlCategory: process.env.ML_CATEGORY || '',
  cronCaptureSchedule: process.env.CRON_CAPTURE_SCHEDULE || '0 * * * *',
  cronPublishSchedule: process.env.CRON_PUBLISH_SCHEDULE || '*/5 * * * *',

  whatsappTargetNumber: process.env.WHATSAPP_TARGET_NUMBER || '5569984520192',
  whatsappTargetGroup: process.env.WHATSAPP_TARGET_GROUP || 'OfertaLar #17',
  mlAffiliateTag: process.env.ML_AFFILIATE_TAG || 'bv20260330080614',
  initialCaptureDelay: 10000,
};
