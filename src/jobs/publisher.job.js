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
            // ✅ VERIFICAÇÃO 1: Horário de publicação
            if (!isWithinPublishTime()) {
                logger.info(`⏳ Fora do horário de publicação definido (${env.publishStartTime || '08:00'} às ${env.publishEndTime || '22:00'}). Pausando o bot de publicação.`);
                await new Promise(r => setTimeout(r, 60000)); // Espera 1 minuto
                continue;
            }

            // ✅ VERIFICAÇÃO 2: WhatsApp DEVE estar conectado ANTES de puxar da fila
            // Isso evita consumir itens da fila enquanto o WhatsApp não está pronto
            if (!publisher.isReady) {
                logger.info('⏳ WhatsApp não está conectado. Aguardando reconexão (30s)...');
                await new Promise(r => setTimeout(r, 30000));
                continue;
            }

            // ✅ VERIFICAÇÃO 3: Buscar próximo item SOMENTE quando tudo está OK
            const item = await repository.getNextApprovedItem();
            if (!item) {
                // Fila vazia — espera mais tempo para não sobrecarregar o banco
                await new Promise(r => setTimeout(r, 30000)); // 30 segundos
                continue;
            }

            logger.info(`📤 Tentando publicar item com ID da fila: ${item.id}`);
            
            // Verifica novamente antes de enviar (pode ter desconectado no intervalo)
            if (!publisher.isReady) {
                logger.warn('⚠️ WhatsApp desconectou entre busca e envio. Item preservado na fila.');
                await new Promise(r => setTimeout(r, 15000));
                continue;
            }

            const success = await publisher.publish(item);

            if (success) {
                await repository.updateQueueStatus(item.id, 'published');
                logger.info(`✅ Item ${item.id} publicado com sucesso.`);
            } else {
                logger.error(`❌ Falha ao publicar item ${item.id}. Item permanece na fila para reprocessamento.`);
                // Se falhou porque o WhatsApp caiu, espera mais
                if (!publisher.isReady) {
                    await new Promise(r => setTimeout(r, 30000));
                    continue;
                }
                // Falha por outro motivo (ex: imagem inválida) — espera e tenta próximo
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }
            
            // Pausa de 3 minutos fixos entre publicações para evitar bloqueios do WhatsApp
            const delayMs = 180000; // 3 minutos
            logger.info(`⏳ Intervalo seguro: Aguardando 3 minutos antes do próximo envio...`);
            await new Promise(r => setTimeout(r, delayMs));
        }
    } catch (error) {
        logger.error('❌ Erro no ciclo de publicação:', error);
    } finally {
        isPublishing = false;
        // Reinicia se der erro severo que quebre o loop
        setTimeout(publishTaskContinuo, 30000);
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
