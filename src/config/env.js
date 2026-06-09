require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'production',
  databaseUrl: process.env.DATABASE_URL,
  dbPath: process.env.DB_PATH || './database.sqlite',
  mlSearchKeyword: process.env.ML_SEARCH_KEYWORD || 'geladeira, cooktop, fogão, forno elétrico, micro-ondas, air fryer, liquidificador, batedeira, cafeteira, sanduicheira, chaleira elétrica, purificador de água, jogo de panelas, frigideira antiaderente, panela de pressão, assadeira, forma de bolo, concha de feijão, escumadeira, espátula de silicone, pegador de alimentos, descascador de legumes, ralador de queijo, tesoura de cozinha, faca do chef, faca para pão, faca para legumes, jogo de facas, chaira para afiar, prato raso, prato fundo, prato de sobremesa, tigela, travessa de vidro, jogo de xícaras, caneca, jogo de copos, jogo de taças, garfo de mesa, faca de mesa, colher de sopa, colher de sobremesa, colher de chá, potes herméticos, escorredor de louça, lixeira, porta-talheres, porta-temperos, sofá, rack para tv, painel para tv, mesa de centro, estante de livros, poltrona, smart tv, soundbar, ventilador, ar-condicionado, cama box, colchão, guarda-roupa, mesa de cabeceira, cômoda, toalha de banho, toalha de rosto, tapete para sala, porta-escova de dentes, porta-sabonete, lixeira de banheiro, espelho decorativo, jogo de lençol, fronha, cobertor casal, edredom, travesseiro, papel higiênico, sabonete, shampoo, condicionador, creme dental, máquina de lavar, tanquinho de lavar roupa, ferro de passar, tábua de passar, cesto de roupas, varal de roupas, prendedor de roupas, balde de plástico, detergente, desinfetante, água sanitária, limpador multiuso, limpa vidro, sabão em pó, amaciante, filtro de linha, extensão elétrica, pilhas recarregáveis, organizador de gaveta, cabides para roupa, cortina, tapete capacho, relógio de parede, caixa de ferramentas',
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
};
