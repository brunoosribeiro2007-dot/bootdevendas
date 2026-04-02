const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { initializeDB } = require('./database/init');
const { startCaptureJob } = require('./jobs/capture.job');
const { startPublishJob } = require('./jobs/publisher.job');
const { startCleanupJob, cleanupTask } = require('./jobs/cleanup.job');
const whatsappPublisher = require('./publishers/whatsapp.publisher');

// Proteção contra erros fatais
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const startServer = async () => {
    logger.info('🚀 Iniciando Processo de Boot...');
    
    try {
        // 1. Ligar o Banco de Dados Neon (Obrigatório)
        await initializeDB();
        logger.info('✅ Banco Neon.tech pronto.');

        // 2. Ligar o Servidor Web para o Render ficar feliz (Porta 10000)
        app.listen(env.port, '0.0.0.0', () => {
            logger.info(`🌐 Servidor Web Ativo na porta ${env.port}`);
        });

        // 3. Ligar o WhatsApp em Segundo Plano (Buscando login no Neon)
        whatsappPublisher.initStatus = 'Buscando login no Neon...';
        whatsappPublisher.initialize().catch(err => {
            logger.error('⚠️ Falha ao ligar WhatsApp:', err.message);
        });

        // 4. Iniciar os Jobs de Captura e Publicação
        startCleanupJob();
        startCaptureJob();
        startPublishJob();
        
        // Ativar a tarefa de limpeza periódica
        cleanupTask.start();
        logger.info('⚙️ Todos os Jobs de automação agendados.');

    } catch (err) {
        logger.error('❌ ERRO CRÍTICO NO STARTUP:', err);
        process.exit(1);
    }
};

startServer();
