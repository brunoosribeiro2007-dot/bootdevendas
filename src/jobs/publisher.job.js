const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const repository = require('../database/repository');
const publisher = require('../publishers/console.publisher');

const publishTask = async () => {
  logger.info('Verificando fila de publicação...');
  try {
    const item = await repository.getNextApprovedItem();
    
    if (!item) {
      logger.info('Nenhum item aprovado na fila para publicar agora.');
      return;
    }

    logger.info(`Tentando publicar item com ID da fila: ${item.id}`);
    const success = await publisher.publish(item);

    if (success) {
      await repository.updateQueueStatus(item.id, 'published');
      logger.info(`Item ${item.id} marcado como publicado com sucesso.`);
    } else {
      logger.error(`Falha ao publicar item ${item.id}. Permanecendo no status atual para retentativa.`);
    }

  } catch (error) {
    logger.error('Erro no job de publicação:', error);
  }
};

const startPublishJob = () => {
  logger.info(`Agendando job de publicação com cron: ${env.cronPublishSchedule}`);
  cron.schedule(env.cronPublishSchedule, publishTask);
};

module.exports = { startPublishJob, publishTask };
