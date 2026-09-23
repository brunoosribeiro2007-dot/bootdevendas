// Habilita bypass de certificados autoassinados para redes corporativas / SSL interception
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
    const errorMsg = reason instanceof Error ? reason.stack : String(reason);
    logger.error(`Unhandled Rejection: ${errorMsg}`);
});
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.stack || err.message}`);
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
            
            // Recupera e reseta itens travados no status 'sending' no boot anterior
            const repository = require('./database/repository');
            await repository.resetSendingStatus();
            
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

    // ✅ PASSO 4: Jobs agendados e pré-carregamento de cupons
    const couponFetcher = require('./services/couponFetcher.service');
    couponFetcher.fetchDailyCoupons().catch(e => logger.warn('⚠️ Erro ao pré-carregar cupons do dia no boot: ' + e.message));

    startCleanupJob();
    startCaptureJob();
    startPublishJob();
    logger.info('⚙️ Jobs de automação agendados.');

    // ✅ PASSO 5: Keep-Alive para evitar spindown do Render
    const externalUrl = process.env.RENDER_EXTERNAL_HOSTNAME;
    if (externalUrl) {
        logger.info(`🔄 Keep-alive ativado para ${externalUrl}`);
        setInterval(() => {
            const http = require('https');
            http.get(`https://${externalUrl}/health`).on('error', (err) => {
                logger.error(`Erro no keep-alive: ${err.message}`);
            });
        }, 14 * 60 * 1000); // 14 minutos
    }
};

startServer().catch(err => {
    logger.error('❌ FALHA FATAL NO BOOT:', err.message);
    process.exit(1);
});
