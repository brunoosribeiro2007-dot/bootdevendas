const env = require('../config/env');
const logger = require('../config/logger');
const repository = require('../database/repository');
const publisher = require('../publishers/whatsapp.publisher');

const isWithinPublishTime = () => {
  const now = new Date();
  
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotal = currentHour * 60 + currentMinute;

  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const startTotal = parseTime(env.publishStartTime || '08:00');
  const endTotal = parseTime(env.publishEndTime || '22:00');
  
  if (startTotal <= endTotal) {
    return currentTotal >= startTotal && currentTotal <= endTotal;
  } else {
    // Caso em que o horário passa da meia-noite (ex: 22:00 as 08:00)
    return currentTotal >= startTotal || currentTotal <= endTotal;
  }
};

let isPublishing = false;

const publishTaskContinuo = async () => {
    if (isPublishing) return;
    isPublishing = true;
    
    try {
        while (true) {
            if (!isWithinPublishTime()) {
                logger.info(`⏳ Fora do horário de publicação definido (${env.publishStartTime || '08:00'} às ${env.publishEndTime || '22:00'}). Pausando o bot de publicação.`);
                await new Promise(r => setTimeout(r, 60000)); // Espera 1 minuto antes de avaliar novamente
                continue;
            }

            const item = await repository.getNextApprovedItem();
            if (!item) {
                // Fila vazia
                await new Promise(r => setTimeout(r, 10000)); // Espera 10 segundos
                continue;
            }

            logger.info(`Tentando publicar item com ID da fila: ${item.id}`);
            const success = await publisher.publish(item);

            if (success) {
                await repository.updateQueueStatus(item.id, 'published');
                logger.info(`✅ Item ${item.id} publicado com sucesso.`);
            } else {
                logger.error(`Falha ao publicar item ${item.id}.`);
            }
            
            // Pausa de 25 a 45 segundos para o WhatsApp não bloquear como SPAM/Flood, mas mantendo o bot rodando de forma contínua
            const delayMs = Math.floor(Math.random() * (45000 - 25000 + 1)) + 25000;
            logger.info(`⏳ Aguardando ${delayMs/1000}s antes da próxima publicação para evitar bloqueio do WhatsApp...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    } catch (error) {
        logger.error('Erro no ciclo de publicação:', error);
    } finally {
        isPublishing = false;
        // Reinicia se der erro severo que quebre o loop
        setTimeout(publishTaskContinuo, 10000);
    }
};

const forcePublish = async () => {
    try {
        const item = await repository.getNextApprovedItem();
        if (!item) {
            logger.info('Tentativa de publicação forçada manual: fila vazia.');
            return;
        }
        logger.info(`Publicação forçada manual solicitada: publicando item ${item.id}`);
        const success = await publisher.publish(item);
        if (success) {
            await repository.updateQueueStatus(item.id, 'published');
            logger.info(`✅ Item ${item.id} publicado forçadamente.`);
        }
    } catch (err) {
        logger.error('Erro na publicação forçada manual:', err);
    }
};

const startPublishJob = () => {
  logger.info(`Agendando job de publicação para modo CONTÍNUO (Sem pausas) das ${env.publishStartTime || '08:00'} às ${env.publishEndTime || '22:00'}`);
  publishTaskContinuo();
};

module.exports = { startPublishJob, publishTask: forcePublish, publishTaskContinuo };
