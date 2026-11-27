/**
 * ==============================================================================
 * INVITE JOB - ROTINA DE ENGAJAMENTO E CONVITE DE MEMBROS NO WHATSAPP
 * ==============================================================================
 * Responsabilidades deste módulo:
 * 1. Disparar mensagens de compartilhamento e convite em horários estratégicos
 *    do dia (ex: 12:15 no almoço e 19:00 no início da noite).
 * 2. Enviar a imagem do meme ("Obrigado amigo você é um amigo") com a legenda
 *    personalizada para cada grupo (Oferta Lar e Infomarket).
 * 3. Utilizar fallback automático para mensagem de texto caso a imagem não possa ser carregada.
 * 4. Evitar múltiplos disparos no mesmo minuto através de controle de idempotência.
 * ==============================================================================
 */

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../config/logger');
const publisher = require('../publishers/whatsapp.publisher');

/**
 * Retorna a hora e minuto atuais no fuso horário operacional de Porto Velho (America/Porto_Velho - UTC-4).
 * @returns {{ hour: number, minute: number, dateStr: string, timeStr: string }}
 */
const getPortoVelhoTime = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Porto_Velho',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;

  const h = Number(hour) % 24;
  const m = Number(minute);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const dateStr = `${year}-${month}-${day}`;

  return { hour: h, minute: m, dateStr, timeStr };
};

/**
 * Monta o texto de convite para o grupo de Casa (Oferta Lar).
 * @param {string} inviteLink - Link de convite do grupo
 * @returns {string}
 */
const buildInviteMessageCasa = (inviteLink) => {
  const link = inviteLink || env.linkInviteCasa;
  return `🤝 *Gostando das ofertas do grupo? Seja um amigo e compartilhe!*

Convide quem você gosta para economizar de verdade nas melhores promoções para casa, cozinha, limpeza e utilidades do dia a dia! 🏡✨

🔗 *Link de convite:*
${link}

_Encaminhe essa mensagem para amigos e familiares economizarem também!_ 💛`;
};

/**
 * Monta o texto de convite para o grupo Gamer / Tech (Infomarket).
 * @param {string} inviteLink - Link de convite do grupo
 * @returns {string}
 */
const buildInviteMessageGamer = (inviteLink) => {
  const link = inviteLink || env.linkInvitePcGamer;
  return `🤝 *Obrigado amigo, você é um amigo!*

Tá curtindo os achados, cupons e quedas de preço de hardware, games e periféricos? Ajude a nossa comunidade a crescer! 🕹️⚡

🔗 *Link de convite:*
${link}

_Manda para aquele amigo que está montando ou dando upgrade no setup!_ 🚀🎮`;
};

// Controle de idempotência para evitar envio duplo no mesmo minuto
const sentSlots = new Set();
let isSending = false;

/**
 * Envia as mensagens de convite para os grupos configurados.
 * @param {boolean} force - Se true, ignora validação de horário
 * @returns {Promise<{ success: boolean, results: object }>}
 */
const sendInviteTask = async (force = false) => {
  if (isSending) {
    logger.debug('⚠️ [InviteJob] Envio de convites já em andamento.');
    return { success: false, reason: 'already_running' };
  }

  isSending = true;
  try {
    const { timeStr, dateStr } = getPortoVelhoTime();
    const slotKey = `${dateStr}_${timeStr}`;

    if (!force) {
      const scheduledTimes = (env.inviteScheduleHours || '10:00,13:00,16:30,20:00')
        .split(',')
        .map(t => t.trim());

      if (!scheduledTimes.includes(timeStr)) {
        return { success: false, reason: 'not_scheduled_time' };
      }

      if (sentSlots.has(slotKey)) {
        logger.debug(`[InviteJob] Horário ${timeStr} já executado hoje (${dateStr}).`);
        return { success: false, reason: 'already_sent_today' };
      }
    }

    if (!publisher.isReady) {
      logger.warn('⚠️ [InviteJob] WhatsApp não está pronto. Cancelando envio de convite.');
      return { success: false, reason: 'whatsapp_not_ready' };
    }

    // Carrega a imagem do meme se disponível
    const memePath = path.resolve(__dirname, '../assets/convide_amigo.jpg');
    let imageBuffer = null;
    if (fs.existsSync(memePath)) {
      try {
        imageBuffer = fs.readFileSync(memePath);
      } catch (err) {
        logger.warn(`[InviteJob] Não foi possível ler imagem do meme (${err.message}). Usando texto puro.`);
      }
    }

    const results = { casa: false, gamer: false };

    // 1. Envio para o Grupo Oferta Lar (Casa)
    const targetCasa = env.whatsappGroupCasa || env.whatsappChannelCasa;
    if (targetCasa) {
      const msgCasa = buildInviteMessageCasa(env.linkInviteCasa);
      try {
        if (imageBuffer && typeof publisher.sendImageMessage === 'function') {
          results.casa = await publisher.sendImageMessage(imageBuffer, msgCasa, targetCasa);
        } else {
          results.casa = await publisher.sendTextMessage(msgCasa, targetCasa);
        }
        logger.info(`✅ [InviteJob] Mensagem de convite enviada para [OFERTA LAR]: ${targetCasa}`);
      } catch (err) {
        logger.error(`❌ [InviteJob] Falha ao enviar convite para Oferta Lar: ${err.message}`);
      }
    }

    // Intervalo de segurança entre envios
    await new Promise(r => setTimeout(r, 2000));

    // 2. Envio para o Grupo Infomarket (PC Gamer)
    const targetGamer = env.whatsappGroupPcGamer || env.whatsappChannelPcGamer;
    if (targetGamer) {
      const msgGamer = buildInviteMessageGamer(env.linkInvitePcGamer);
      try {
        if (imageBuffer && typeof publisher.sendImageMessage === 'function') {
          results.gamer = await publisher.sendImageMessage(imageBuffer, msgGamer, targetGamer);
        } else {
          results.gamer = await publisher.sendTextMessage(msgGamer, targetGamer);
        }
        logger.info(`✅ [InviteJob] Mensagem de convite enviada para [INFOMARKET]: ${targetGamer}`);
      } catch (err) {
        logger.error(`❌ [InviteJob] Falha ao enviar convite para Infomarket: ${err.message}`);
      }
    }

    // Se nenhum grupo específico estiver definido, tenta destino padrão
    if (!targetCasa && !targetGamer) {
      const defaultMsg = env.niche === 'pc_gamer'
        ? buildInviteMessageGamer(env.linkInvitePcGamer)
        : buildInviteMessageCasa(env.linkInviteCasa);

      if (imageBuffer && typeof publisher.sendImageMessage === 'function') {
        results.default = await publisher.sendImageMessage(imageBuffer, defaultMsg);
      } else {
        results.default = await publisher.sendTextMessage(defaultMsg);
      }
      logger.info('✅ [InviteJob] Mensagem de convite enviada para destino padrão.');
    }

    if (!force) {
      sentSlots.add(slotKey);
      // Limpeza de slots de dias anteriores para não acumular memória
      for (const key of sentSlots) {
        if (!key.startsWith(dateStr)) {
          sentSlots.delete(key);
        }
      }
    }

    return { success: true, results };
  } catch (error) {
    logger.error('❌ [InviteJob] Erro durante o disparo de convites:', error);
    return { success: false, error: error.message };
  } finally {
    isSending = false;
  }
};

/**
 * Inicializa o cron de verificação do job de convites.
 */
const startInviteJob = () => {
  if (!env.enableInviteJob) {
    logger.info('ℹ️ [InviteJob] Job de convite desativado via configuração (ENABLE_INVITE_JOB=false).');
    return;
  }

  logger.info(`🤝 [InviteJob] Job de convites ativado. Horários configurados: ${env.inviteScheduleHours || '10:00,13:00,16:30,20:00'} (Fuso Porto Velho)`);
  // Roda a cada minuto para checar se o minuto atual coincide com os horários configurados
  cron.schedule('* * * * *', () => {
    sendInviteTask(false).catch(err => {
      logger.error('❌ [InviteJob] Erro na execução periódica:', err);
    });
  });
};

module.exports = {
  startInviteJob,
  sendInviteTask,
  buildInviteMessageCasa,
  buildInviteMessageGamer,
  getPortoVelhoTime
};
