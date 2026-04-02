const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');

// Capturar erros globais para evitar que o Render derrube o serviço em timeouts
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const { initializeDB } = require('./database/init');
const { startCaptureJob } = require('./jobs/capture.job');
const { startPublishJob } = require('./jobs/publisher.job');
const { startCleanupJob, cleanupTask } = require('./jobs/cleanup.job');

const startServer = async () => {
    // 1. Iniciar servidor web IMEDIATAMENTE (Passo crucial para o Render)
    const server = app.listen(env.port, () => {
        logger.info(`🚀 Servidor pronto na porta ${env.port}. Motor: ${env.nodeEnv}`);
    });

    try {
        // 2. Inicializar o banco de dados (Assíncrono)
        await initializeDB();
        logger.info('📦 Banco de Dados Pronto.');

        // 3. Iniciar o Motor do WhatsApp (Baileys)
        const whatsappPublisher = require('./publishers/whatsapp.publisher');
        whatsappPublisher.initialize().catch(err => {
            logger.error('Falha na inicialização do Baileys:', err);
        });
        
        // 4. Iniciar Cron Jobs
        const { startCaptureJob } = require('./jobs/capture.job');
        const { startPublishJob } = require('./jobs/publisher.job');
        const { startCleanupJob, cleanupTask } = require('./jobs/cleanup.job');

        startCleanupJob();
        startCaptureJob();
        startPublishJob();

        // Limpeza inicial assíncrona
        cleanupTask().catch(e => logger.error('Erro na limpeza inicial:', e));

        // 5. Primeira captura de ofertas agendada para daqui a pouco
        setTimeout(() => {
            logger.info('🛰️ Disparando captura inicial de ofertas...');
            const { captureTask } = require('./jobs/capture.job');
            captureTask().catch(e => logger.error('Erro na captura inicial:', e));
        }, 150000); // 2.5 minutos (dando tempo para o Baileys estabilizar na nuvem)

    } catch (error) {
        logger.error('⚠️ Falha parcial na inicialização (Servidor segue vivo):', error);
    }
};

startServer();
