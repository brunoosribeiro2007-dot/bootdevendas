const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');

const captureTask = async () => {
  logger.info('Iniciando job de captura multi-item do ML...');
  try {
    const keywords = env.mlSearchKeyword.split(',').map(k => k.trim());
    let totalAddedCount = 0;

    for (const keyword of keywords) {
        logger.info(`Buscando por: ${keyword}`);
        const products = await mlService.searchProducts(keyword, env.mlCategory);
        logger.info(`Busca por '${keyword}' retornou ${products.length} produtos.`);

        for (const product of products) {
            if (!product.title || !product.price || !product.link || !product.imageUrl) {
                continue;
            }

            const rawMessage = await formatterService.generateRawMessage(product);
            const formattedMessage = await formatterService.generateFormattedMessage(product);

            const added = await queueService.addToQueue(product, rawMessage, formattedMessage);
            if (added) totalAddedCount++;
        }
    }

    // Disparar publicação após terminar todas as capturas
    const { publishTask } = require('./publisher.job');
    publishTask();

    logger.info(`Job de captura multi-item finalizado. ${totalAddedCount} novos produtos adicionados à fila pendente.`);
  } catch (error) {
    logger.error('Erro no job de captura multi-item:', error);
  }
};

const startCaptureJob = () => {
  logger.info(`Agendando job de captura com cron: ${env.cronCaptureSchedule}`);
  cron.schedule(env.cronCaptureSchedule, captureTask);
};

module.exports = { startCaptureJob, captureTask };
