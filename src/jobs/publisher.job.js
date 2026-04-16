const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const repository = require('../database/repository');
const publisher = require('../publishers/whatsapp.publisher');

const publishTask = async () => {
  logger.info('Verificando fila de publicação...');
  try {
    // Reduzindo para 3 itens no máximo para não dar block do WPP
    const maxPerCycle = 3;
    let publishedCount = 0;

    for (let i = 0; i < maxPerCycle; i++) {
      const item = await repository.getNextApprovedItem();
      
      if (!item) {
        if (publishedCount === 0) {
          logger.info('Nenhum item aprovado na fila para publicar agora.');
        }
        break;
      }

      logger.info(`Tentando publicar item com ID da fila: ${item.id}`);
      const success = await publisher.publish(item);

      if (success) {
        await repository.updateQueueStatus(item.id, 'published');
        publishedCount++;
        logger.info(`✅ Item ${item.id} publicado com sucesso. (${publishedCount}/${maxPerCycle})`);
        
        // Aumentando BASTANTE o delay para o WhatsApp não bloquear
        // Tempo randomizado entre 45 e 90 segundos para parecer humano
        if (i < maxPerCycle - 1) {
          const delayMs = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;
          logger.info(`⏳ Aguardando ${delayMs/1000}s para o próximo post...`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      } else {
        logger.error(`Falha ao publicar item ${item.id}. Tentando próximo.`);
      }
    }

    if (publishedCount > 0) {
      logger.info(`📊 Ciclo de publicação finalizado: ${publishedCount} itens publicados.`);
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
