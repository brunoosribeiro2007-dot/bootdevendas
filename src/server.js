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
  try {
    // Inicializar o banco de dados
    await initializeDB();
    
    // Iniciar jobs
    startCleanupJob();
    startCaptureJob();
    startPublishJob();

    // Executar limpeza inicial como precaução
    await cleanupTask();

    // Disparar uma captura inicial daqui a 15 segundos para o bot não começar vazio
    // e dar tempo dele carregar o QR/Sessão e estar Ready.
    setTimeout(() => {
        logger.info('Disparando captura inicial após delay de 15s...');
        const { captureTask } = require('./jobs/capture.job');
        captureTask();
    }, 15000);

    // Iniciar servidor web
    app.listen(env.port, () => {
      logger.info(`Servidor rodando na porta ${env.port}`);
    });
  } catch (error) {
    logger.error('Falha ao iniciar a aplicação:', error);
    process.exit(1);
  }
};

startServer();
