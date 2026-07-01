const env = require('../config/env');
const logger = require('../config/logger');
const repository = require('../database/repository');
const publisher = require('../publishers/whatsapp.publisher');
const cron = require('node-cron');

const getPortoVelhoTime = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Porto_Velho',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  return { hour: h % 24, minute: m };
};

const parseTime = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const isWithinPublishTime = () => {
  const { hour: currentHour, minute: currentMinute } = getPortoVelhoTime();
  const currentTotal = currentHour * 60 + currentMinute;

  const startTotal = parseTime(env.publishStartTime || '08:00');
  const endTotal = parseTime(env.publishEndTime || '22:00');
  
  if (startTotal <= endTotal) {
    return currentTotal >= startTotal && currentTotal <= endTotal;
  } else {
    // Caso em que o horário passa da meia-noite (ex: 22:00 as 08:00)
    return currentTotal >= startTotal || currentTotal <= endTotal;
  }
};

const shouldSendGoodNight = () => {
  const { hour: currentHour, minute: currentMinute } = getPortoVelhoTime();
  const currentTotal = currentHour * 60 + currentMinute;
  
  const endTotal = parseTime(env.publishEndTime || '22:00');
  
  // Diferença em minutos considerando ciclo de 24h
  const diff = (currentTotal - endTotal + 1440) % 1440;
  // Retorna true apenas se estivermos nos primeiros 15 minutos após o horário de término
  return diff >= 0 && diff <= 15;
};

let isPublishing = false;
let sentGoodNightMessage = false;
let retryTimeout = null;

const publishTask = async () => {
    if (isPublishing) {
        logger.debug('⚠️ [PublishTask] Tentativa de publicação ignorada: envio em andamento.');
        return;
    }
    isPublishing = true;
    
    try {
        // ✅ VERIFICAÇÃO 1: Horário de publicação
        if (!isWithinPublishTime()) {
            if (!sentGoodNightMessage && shouldSendGoodNight()) {
                try {
                    logger.info('Tentando enviar mensagem de boa noite...');
                    const goodNightMsg = `🌙 *Boa noite, pessoal!*\n\nPor hoje encerramos nossas ofertas. Amanhã voltamos com mais achados e cupons imperdíveis! Fiquem com Deus e tenham uma excelente noite! ✨💤`;
                    const sent = await publisher.sendTextMessage(goodNightMsg);
                    if (sent) {
                        sentGoodNightMessage = true;
                        logger.info('✅ Mensagem de boa noite enviada com sucesso!');
                    }
                } catch (err) {
                    logger.error('Erro ao enviar mensagem de boa noite:', err);
                }
            }
            return;
        }

        // Reseta a flag para que o boa noite possa ser enviado no final do próximo dia
        if (sentGoodNightMessage) {
            sentGoodNightMessage = false;
        }

        // ✅ VERIFICAÇÃO 2: WhatsApp DEVE estar conectado
        if (!publisher.isReady) {
            logger.warn('⏳ WhatsApp não está conectado. Agendando nova tentativa de publicação em 30 segundos.');
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
            retryTimeout = setTimeout(() => {
                retryTimeout = null;
                publishTask().catch(err => logger.error('Erro ao retentar publicação:', err));
            }, 30000);
            return;
        }

        // ✅ Recuperação automática de itens travados em 'sending' por mais de 10 minutos
        await repository.resetStuckSendingItems();

        // ✅ VERIFICAÇÃO 3: Buscar próximo item
        const item = await repository.getNextApprovedItem();
        if (!item) {
            logger.info('ℹ️ Fila de publicações aprovadas está vazia. Disparando captura emergencial em segundo plano...');
            const captureJob = require('./capture.job');
            const capturePromise = captureJob.captureTask();
            if (capturePromise && typeof capturePromise.catch === 'function') {
                capturePromise.catch(err => logger.error('Erro na captura emergencial:', err));
            }
            return;
        }

        logger.info(`📤 Tentando publicar item com ID da fila: ${item.id}`);
        
        try {
            // Verifica novamente antes de enviar
            if (!publisher.isReady) {
                logger.warn('⚠️ WhatsApp desconectou entre busca e envio. Item preservado na fila.');
                await repository.updateQueueStatus(item.id, 'approved'); // Devolve para 'approved'
                return;
            }

            // Gera a mensagem formatada dinamicamente na hora do envio
            const formatterService = require('../services/formatter.service');
            item.formatted_message = await formatterService.generateFormattedMessage(item, item.link);

            const success = await publisher.publish(item);

            if (success) {
                // Remove o produto e item da fila do banco para não ocupar espaço
                await repository.deleteProductAndQueueItem(item.product_id, item.description);
                logger.info(`✅ Item ${item.id} publicado com sucesso e removido do banco.`);
            } else {
                logger.error(`❌ Falha ao publicar item ${item.id}. Item permanece na fila para reprocessamento.`);
                await repository.updateQueueStatus(item.id, 'approved');
            }
        } catch (itemError) {
            logger.error(`❌ Erro crítico ao processar/publicar item ${item.id}:`, itemError.stack || itemError.message || itemError);
            await repository.updateQueueStatus(item.id, 'approved');
        }
    } catch (error) {
        logger.error('❌ Erro no ciclo de publicação:', error);
    } finally {
        isPublishing = false;
    }
};

const startPublishJob = () => {
  logger.info(`Agendando job de publicação com cron: ${env.cronPublishSchedule} das ${env.publishStartTime || '08:00'} às ${env.publishEndTime || '22:00'}`);
  cron.schedule(env.cronPublishSchedule, publishTask);
  
  // Executa uma vez no boot se estiver dentro do horário de publicação para não ter que esperar o primeiro tick do cron
  if (isWithinPublishTime()) {
      logger.info('🚀 Executando disparo de publicação inicial pós-boot...');
      setTimeout(() => {
          publishTask().catch(err => logger.error('Erro na publicação inicial:', err));
      }, 15000); // 15 segundos após o boot
  }
};

module.exports = { startPublishJob, publishTask, publishTaskContinuo: publishTask };
