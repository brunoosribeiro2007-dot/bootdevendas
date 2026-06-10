const cron = require('node-cron');
const repository = require('../database/repository');
const logger = require('../config/logger');

// Função para limpar apenas a fila (preserva histórico de produtos por 3 dias)
const cleanupTask = async () => {
    try {
        logger.info('Iniciando limpeza diária da fila de publicações (fim do expediente/novo dia)...');
        await repository.clearQueueOnly();
        logger.info('Fila de publicações limpa com sucesso! Histórico de produtos preservado.');
    } catch (error) {
        logger.error('Erro ao realizar limpeza diária da fila:', error);
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
