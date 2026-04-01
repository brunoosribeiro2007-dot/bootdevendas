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
    // 1. Iniciar servidor web IMEDIATAMENTE para o Render não derrubar por timeout de porta
    app.listen(env.port, () => {
      logger.info(`🚀 Servidor pronto e escutando na porta ${env.port}`);
    });

    // 2. Inicializar o banco de dados
    await initializeDB();
    
    // 3. Iniciar jobs
    startCleanupJob();
    startCaptureJob();
    startPublishJob();

    // 4. Executar limpeza inicial como precaução
    await cleanupTask();

    // 5. Disparar uma captura inicial daqui a 120 segundos (2 minutos)
    setTimeout(() => {
        logger.info('🛰️ Iniciando primeira captura de ofertas...');
        const { captureTask } = require('./jobs/capture.job');
        captureTask();
    }, 120000);

  } catch (error) {
    logger.error('Falha crítica na inicialização:', error);
    // Não dar process.exit(1) imediatamente aqui para tentar manter o servidor web vivo se possível
  }
};

startServer();
