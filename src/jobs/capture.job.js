const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');

const captureTask = async () => {
  logger.info('🚀 Iniciando job de captura multi-item do ML...');
  try {
    let keywordsString = env.mlSearchKeyword || '';
    
    // 🚨 OVERRIDE FORÇADO: Se as keywords do painel do Render ainda forem as antigas, ignoramos e usamos as novas.
    if (keywordsString.toLowerCase().includes('xiaomi') || keywordsString.toLowerCase().includes('iphone') || keywordsString.toLowerCase().includes('teclado')) {
        logger.warn('⚠️ Detectadas keywords antigas no painel do Render. Aplicando OVERRIDE para o novo nicho (Casa/Limpeza).');
        keywordsString = 'sabão líquido OMO, amaciante Downy, geladeira Frost Free, fogão 4 bocas, máquina de lavar, sofá retrátil, guarda-roupa, mesa de jantar, fritadeira Air Fryer, micro-ondas, ar condicionado';
    }

    const keywords = keywordsString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    logger.info(`📋 Keywords ativas para busca: ${keywords.join(', ')}`);
    
    let totalAddedCount = 0;

    for (const keyword of keywords) {
        try {
            logger.info(`🔎 Buscando por: ${keyword}`);
            const products = await mlService.searchProducts(keyword, env.mlCategory);
            logger.info(`📦 Busca por '${keyword}' retornou ${products.length} produtos.`);

            for (const product of products) {
                if (!product.title || !product.price || !product.link) {
                    continue;
                }

                // Normalização básica de imagem
                if (!product.imageUrl) {
                    product.imageUrl = 'https://www.mercadolivre.com.br/menu/img/logo__large_plus.png';
                }

                const rawMessage = await formatterService.generateRawMessage(product);
                const formattedMessage = await formatterService.generateFormattedMessage(product);

                const added = await queueService.addToQueue(product, rawMessage, formattedMessage);
                if (added) {
                    totalAddedCount++;
                }
            }

            // Aguarda 2 segundos antes da próxima palavra-chave para evitar bloqueio
            if (keywords.indexOf(keyword) < keywords.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (keywordError) {
            logger.error(`❌ Erro ao processar palavra-chave "${keyword}":`, keywordError.message);
        }
    }


    // Disparar publicação após terminar todas as capturas
    const { publishTask } = require('./publisher.job');
    publishTask().catch(err => logger.error('Erro ao disparar publisher após captura:', err));

    logger.info(`✅ Job de captura finalizado. ${totalAddedCount} novos produtos adicionados à fila.`);
  } catch (error) {
    logger.error('❌ Erro crítico no job de captura multi-item:', error);
  }
};

const startCaptureJob = () => {
  logger.info(`Agendando job de captura com cron: ${env.cronCaptureSchedule}`);
  cron.schedule(env.cronCaptureSchedule, captureTask);

  // Disparo inicial após 10 segundos para resultados imediatos
  if (env.nodeEnv === 'production' || true) {
      logger.info('🚀 Agendando captura inicial para 10 segundos após o boot...');
      setTimeout(() => {
          captureTask().catch(err => logger.error('Erro na captura inicial:', err));
      }, 10000);
  }
};

module.exports = { startCaptureJob, captureTask };
