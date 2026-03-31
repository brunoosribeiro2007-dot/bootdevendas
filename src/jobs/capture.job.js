const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');

const captureTask = async () => {
  logger.info('Iniciando job de captura de produtos do ML...');
  try {
    const products = await mlService.searchProducts(env.mlSearchKeyword, env.mlCategory);
    logger.info(`Busca retornou ${products.length} produtos. Processando...`);

    let addedCount = 0;
    for (const product of products) {
      if (!product.title || !product.price || !product.link || !product.imageUrl) {
        logger.warn(`Produto inválido ignorado: ${product.id}`);
        continue;
      }

      const rawMessage = await formatterService.generateRawMessage(product);
      const formattedMessage = await formatterService.generateFormattedMessage(product);

      const added = await queueService.addToQueue(product, rawMessage, formattedMessage);
      if (added) addedCount++;
    }

    const { publishTask } = require('./publisher.job');
    publishTask();

    logger.info(`Job de captura finalizado. ${addedCount} novos produtos adicionados à fila pendente.`);
  } catch (error) {
    logger.error('Erro no job de captura:', error);
  }
};

const startCaptureJob = () => {
  logger.info(`Agendando job de captura com cron: ${env.cronCaptureSchedule}`);
  cron.schedule(env.cronCaptureSchedule, captureTask);
};

module.exports = { startCaptureJob, captureTask };
