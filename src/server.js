/**
 * ==============================================================================
 * SERVER.JS - PONTO DE ENTRADA E INICIALIZAÇÃO DA APLICAÇÃO
 * ==============================================================================
 * Orquestra o ciclo de vida e a ordem correta de boot dos serviços:
 * 1. Servidor Web Express (Porta aberta imediatamente para Healthcheck do Render).
 * 2. Banco de Dados (com retry automático de até 3 tentativas).
 * 3. WhatsApp Baileys (em segundo plano, sem bloquear a inicialização).
 * 4. Agendadores Cron (Captura, Publicação e Limpeza).
 * 5. Keep-Alive periódico para evitar spindown em hospedagens gratuitas (Render).
 * ==============================================================================
 */

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: PROTEÇÃO DO PROCESSO E TRATAMENTO DE ERROS GLOBAIS
// ──────────────────────────────────────────────────────────────────────────────

// Habilita bypass de certificados autoassinados para redes corporativas / proxies SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { initializeDB } = require('./database/init');
const { startCaptureJob } = require('./jobs/capture.job');
const { startPublishJob } = require('./jobs/publisher.job');
const { startCleanupJob } = require('./jobs/cleanup.job');
const whatsappPublisher = require('./publishers/whatsapp.publisher');

// Captura de rejeições e exceções não tratadas para evitar encerramento inesperado
process.on('unhandledRejection', (reason) => {
  const errorMsg = reason instanceof Error ? reason.stack : String(reason);
  logger.error(`[Unhandled Rejection] ${errorMsg}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`[Uncaught Exception] ${err.stack || err.message}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: FLUXO DE INICIALIZAÇÃO (BOOT)
// ──────────────────────────────────────────────────────────────────────────────

const startServer = async () => {
  logger.info('🚀 Iniciando Boot do Sistema de Automação de Afiliados...');

  // PASSO 1: Servidor Web sobe primeiro
  // Garante que o endpoint /health responda ao Render antes do timeout de deploy
  await new Promise((resolve, reject) => {
    app.listen(env.port, '0.0.0.0', () => {
      logger.info(`🌐 Servidor Web ativo na porta ${env.port}`);
      resolve();
    }).on('error', reject);
  });

  // PASSO 2: Inicialização Resiliente do Banco de Dados
  // Executa até 3 tentativas com intervalo de 5 segundos em caso de oscilação de rede
  let dbOk = false;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await initializeDB();
      dbOk = true;
      logger.info('✅ Banco de dados conectado e tabelas sincronizadas.');

      // Destrava itens que ficaram com status 'sending' no boot anterior
      const repository = require('./database/repository');
      await repository.resetSendingStatus();
      await repository.seedInitialProductsIfEmpty();
      break;
    } catch (err) {
      logger.error(`❌ Tentativa de conexão ao banco ${tentativa}/3 falhou: ${err.message}`);
      if (tentativa < 3) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  if (!dbOk) {
    logger.error('❌ Banco de dados indisponível após 3 tentativas. Continuando em modo degradado.');
  }

  // PASSO 3: Inicialização do Motor do WhatsApp (Baileys)
  // Executado de forma assíncrona para que a porta web nunca trave aguardando QR Code
  whatsappPublisher.initialize().catch(err => {
    logger.error('⚠️ Falha ao inicializar motor do WhatsApp:', err.message);
  });

  // PASSO 4: Pré-carregamento de Cupons e Agendamento dos Jobs
  const couponFetcher = require('./services/couponFetcher.service');
  couponFetcher.fetchDailyCoupons().catch(e => {
    logger.warn('⚠️ Erro ao pré-carregar cupons diários no boot: ' + e.message);
  });

  startCleanupJob(); // Limpeza diária de fila à meia-noite
  startCaptureJob(); // Coleta periódica de produtos
  startPublishJob(); // Publicação periódica de mensagens no WhatsApp

  // Monitor preventivo de renovação OAuth 2.0 (Mercado Livre)
  const tokenManager = require('./auth/tokenManager');
  tokenManager.startAutoRefreshJob(20);

  logger.info('⚙️ Jobs de automação agendados com sucesso.');

  // PASSO 5: Rotina de Keep-Alive (Prevenção de Spindown no Render Free)
  const externalUrl = process.env.RENDER_EXTERNAL_HOSTNAME;
  if (externalUrl) {
    logger.info(`🔄 Keep-alive ativado para o host https://${externalUrl}`);
    setInterval(() => {
      const https = require('https');
      https.get(`https://${externalUrl}/health`).on('error', (err) => {
        logger.error(`Erro no ping de keep-alive: ${err.message}`);
      });
    }, 14 * 60 * 1000); // Executa a cada 14 minutos
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 3: DISPARO DA INICIALIZAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

startServer().catch(err => {
  logger.error('❌ FALHA FATAL NO BOOT:', err.message);
  process.exit(1);
});
