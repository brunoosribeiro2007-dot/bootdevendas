const cron = require('node-cron');
const repository = require('../database/repository');
const logger = require('../config/logger');

// Função para limpar fila e expirar/remover cupons antigos
const cleanupTask = async () => {
    try {
        logger.info('Iniciando limpeza diária da fila e cupons antigos (fim do expediente/novo dia)...');
        
        // 1. Limpa a fila de envio para o novo dia
        await repository.clearQueueOnly();
        logger.info('Fila de publicações limpa com sucesso! Histórico de produtos preservado.');

        // 2. Desativa cupons com mais de 24 horas e remove cupons com mais de 7 dias
        await repository.deactivateExpiredCoupons(24);
        await repository.pruneOldCoupons(7);
        logger.info('Expiração e limpeza de cupons concluídas com sucesso.');

        // 3. Dispara nova coleta fresca de cupons para o novo dia
        const couponFetcher = require('../services/couponFetcher.service');
        couponFetcher.fetchDailyCoupons(true).catch(e => {
            logger.warn(`[CleanupJob] Erro ao atualizar cupons após virada de dia: ${e.message}`);
        });

    } catch (error) {
        logger.error('Erro ao realizar limpeza diária:', error);
    }
};

// Agenda para rodar todo dia às 00:05 no fuso horário de Porto Velho (America/Porto_Velho)
const startCleanupJob = () => {
    cron.schedule('5 0 * * *', cleanupTask, {
        timezone: "America/Porto_Velho"
    });
    logger.info('Job de limpeza diária agendado para 00:05 no fuso horário de Porto Velho (America/Porto_Velho).');
};

module.exports = {
    startCleanupJob,
    cleanupTask
};
