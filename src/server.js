const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { initializeDB } = require('./database/init');
const { startCaptureJob } = require('./jobs/capture.job');
const { startPublishJob } = require('./jobs/publisher.job');
const { startCleanupJob } = require('./jobs/cleanup.job');
const whatsappPublisher = require('./publishers/whatsapp.publisher');

// Proteção contra erros fatais não tratados
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', String(reason));
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err.message);
});

const startServer = async () => {
    logger.info('🚀 Iniciando Boot...');

    // ✅ PASSO 1: Servidor web sobe PRIMEIRO — porta sempre aberta para o Render
    await new Promise((resolve, reject) => {
        app.listen(env.port, '0.0.0.0', () => {
            logger.info(`🌐 Servidor Web ativo na porta ${env.port}`);
            resolve();
        }).on('error', reject);
    });

    // ✅ PASSO 2: Banco de dados com retry automático (3 tentativas)
    let dbOk = false;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
            await initializeDB();
            dbOk = true;
            logger.info('✅ Banco de dados pronto.');
            break;
        } catch (err) {
            logger.error(`❌ Tentativa ${tentativa}/3 falhou: ${err.message}`);
            if (tentativa < 3) await new Promise(r => setTimeout(r, 5000));
        }
    }

    if (!dbOk) {
        logger.error('❌ Banco indisponível após 3 tentativas. Continuando sem banco (modo degradado).');
    }

    // ✅ PASSO 3: WhatsApp em background (nunca trava o boot)
    whatsappPublisher.initialize().catch(err => {
        logger.error('⚠️ Falha ao iniciar WhatsApp:', err.message);
    });

    // ✅ PASSO 4: Jobs agendados
    startCleanupJob();
    startCaptureJob();
    startPublishJob();
    logger.info('⚙️ Jobs de automação agendados.');
};

startServer().catch(err => {
    logger.error('❌ FALHA FATAL NO BOOT:', err.message);
    process.exit(1);
});
