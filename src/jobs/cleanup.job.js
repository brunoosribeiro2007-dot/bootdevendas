const cron = require('node-cron');
const repository = require('../database/repository');
const logger = require('../config/logger');

// Função para limpar a fila e produtos
const cleanupTask = async () => {
    try {
        logger.info('Iniciando limpeza diária do banco de dados (novo dia)...');
        await repository.clearQueue();
        logger.info('Banco de dados limpo com sucesso! Pronto para novas ofertas.');
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
