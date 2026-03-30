const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { initializeDB } = require('./database/init');
const { startCaptureJob } = require('./jobs/capture.job');
const { startPublishJob } = require('./jobs/publisher.job');

const startServer = async () => {
  try {
    // Inicializar o banco de dados
    await initializeDB();
    
    // Iniciar jobs
    startCaptureJob();
    startPublishJob();

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
