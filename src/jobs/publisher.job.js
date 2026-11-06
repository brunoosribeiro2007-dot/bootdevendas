/**
 * ==============================================================================
 * PUBLISHER JOB - ROTINA DE PUBLICAÇÃO AUTOMATIZADA NO WHATSAPP
 * ==============================================================================
 * Responsabilidades deste módulo:
 * 1. Respeitar a janela de horário de envio configurada no fuso de Porto Velho.
 * 2. Enviar mensagem de encerramento ("Boa Noite") ao fechar a janela diária.
 * 3. Verificar o status da conexão do WhatsApp antes de tentar o disparo.
 * 4. Consumir a fila de ofertas aprovadas e acionar o serviço de publicação.
 * 5. Se a fila estiver vazia, acionar captura emergencial automática.
 * 6. Limpar do banco os itens publicados com sucesso para otimizar espaço em disco.
 * ==============================================================================
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const repository = require('../database/repository');
const publisher = require('../publishers/whatsapp.publisher');
const formatterService = require('../services/formatter.service');

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: UTILITÁRIOS DE FUSO HORÁRIO E JANELA DE OPERAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a hora e minuto atuais no fuso horário operacional de Porto Velho (America/Porto_Velho - UTC-4).
 * @returns {{ hour: number, minute: number }}
 */
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

/**
 * Converte string no formato "HH:MM" para o total acumulado de minutos no dia (0 a 1439).
 * @param {string} timeStr - Horário no formato "08:00" ou "22:00".
 * @returns {number} Minutos desde o início do dia.
 */
const parseTime = (timeStr) => {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Verifica se o momento atual está dentro da janela de publicação permitida.
 * Trata tanto faixas normais (ex: 08:00 às 22:00) quanto faixas que cruzam a meia-noite.
 * @returns {boolean} True se estiver dentro do horário de disparo.
 */
const isWithinPublishTime = () => {
  const { hour: currentHour, minute: currentMinute } = getPortoVelhoTime();
  const currentTotal = currentHour * 60 + currentMinute;

  const startTotal = parseTime(env.publishStartTime || '08:00');
  const endTotal = parseTime(env.publishEndTime || '22:00');

  if (startTotal <= endTotal) {
    return currentTotal >= startTotal && currentTotal <= endTotal;
  }
  // Caso a janela passe pela virada da meia-noite (ex: 22:00 às 08:00)
  return currentTotal >= startTotal || currentTotal <= endTotal;
};

/**
 * Determina se a mensagem de "Boa Noite" deve ser enviada aos membros do grupo.
 * Só retorna true nos primeiros 15 minutos logo após o término do horário de publicação.
 * @returns {boolean} True se estiver nos 15 minutos pós-expediente.
 */
const shouldSendGoodNight = () => {
  const { hour: currentHour, minute: currentMinute } = getPortoVelhoTime();
  const currentTotal = currentHour * 60 + currentMinute;
  const endTotal = parseTime(env.publishEndTime || '22:00');

  const diff = (currentTotal - endTotal + 1440) % 1440;
  return diff >= 0 && diff <= 15;
};

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: ESTADOS DE CONTROLE DO JOB
// ──────────────────────────────────────────────────────────────────────────────

let isPublishing = false;
let sentGoodNightMessage = false;
let retryTimeout = null;

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 3: CICLO DE PUBLICAÇÃO PRINCIPAL (publishTask)
// ──────────────────────────────────────────────────────────────────────────────

const publishTask = async (force = false) => {
  if (isPublishing) {
    logger.debug('⚠️ [PublishTask] Tentativa de publicação ignorada: envio em andamento.');
    return;
  }
  isPublishing = true;

  try {
    // ─── 1. Validação da Janela de Horário ────────────────────────────────────
    if (!force && !isWithinPublishTime()) {
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

    // Reseta flag para que o boa noite seja disparado novamente no fim do próximo dia
    if (sentGoodNightMessage) {
      sentGoodNightMessage = false;
    }

    // ─── 2. Validação da Conexão do WhatsApp ──────────────────────────────────
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

    // ─── 3. Recuperação de Itens Travados ─────────────────────────────────────
    await repository.resetStuckSendingItems();

    // ─── 4. Busca do Próximo Item Aprovado na Fila ───────────────────────────
    let item = await repository.getNextApprovedItem();
    if (!item) {
      logger.info('ℹ️ Fila de publicações aprovadas está vazia. Verificando seed inicial...');
      await repository.seedInitialProductsIfEmpty();
      item = await repository.getNextApprovedItem();
    }

    if (!item) {
      logger.info('ℹ️ Fila continua vazia após verificação de seed. Disparando captura emergencial em segundo plano...');
      const captureJob = require('./capture.job');
      const capturePromise = captureJob.captureTask();
      if (capturePromise && typeof capturePromise.catch === 'function') {
        capturePromise.catch(err => logger.error('Erro na captura emergencial:', err));
      }
      return;
    }

    logger.info(`📤 Tentando publicar item com ID da fila: ${item.id} ("${item.title}")`);

    try {
      // Revalida a prontidão do WhatsApp antes de disparar a mídia
      if (!publisher.isReady) {
        logger.warn('⚠️ WhatsApp desconectou entre busca e envio. Item preservado na fila.');
        await repository.updateQueueStatus(item.id, 'approved');
        return;
      }

      // ─── 5. Formatação Dinâmica da Mensagem Promocional ─────────────────────
      item.formatted_message = await formatterService.generateFormattedMessage(item, item.link);

      // ─── 6. Disparo da Mensagem (Texto + Imagem) em todos os destinos ─────────
      const success = await publisher.publish(item);

      if (success) {
        // Remove produto publicado do banco e da fila para economizar espaço
        await repository.deleteProductAndQueueItem(item.product_id, item.description);
        logger.info(`✅ Item ${item.id} ("${item.title}") publicado com sucesso e removido da fila.`);
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

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 4: AGENDAMENTO E DISPARO INICIAL DO JOB
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Registra o cron de publicações periódicas e agenda execução imediata após o boot
 * caso o sistema suba dentro da janela de horário de envio permitida.
 */
const startPublishJob = () => {
  logger.info(`Agendando job de publicação com cron: ${env.cronPublishSchedule} das ${env.publishStartTime || '08:00'} às ${env.publishEndTime || '22:00'}`);
  cron.schedule(env.cronPublishSchedule, () => publishTask(false));

  // Executa uma vez no boot para publicar sem esperar o próximo ciclo do cron
  if (isWithinPublishTime()) {
    logger.info('🚀 Executando disparo de publicação inicial pós-boot...');
    setTimeout(() => {
      publishTask(false).catch(err => logger.error('Erro na publicação inicial:', err));
    }, 15000); // 15 segundos após a inicialização
  }
};

module.exports = {
  startPublishJob,
  publishTask,
  publishTaskContinuo: publishTask
};
