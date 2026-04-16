const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');

// Índice global para rotacionar as keywords a cada ciclo
let keywordRotationIndex = 0;

const captureTask = async () => {
  logger.info('🚀 Iniciando job de captura multi-item do ML...');
  try {
    let keywordsString = env.mlSearchKeyword || '';
    const allKeywords = keywordsString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    if (allKeywords.length === 0) {
        logger.warn('⚠️ Nenhuma keyword configurada! Verifique ML_SEARCH_KEYWORD.');
        return;
    }

    // 🔄 ROTAÇÃO: Processa no máximo 10 keywords por ciclo para evitar timeout
    // A cada hora, pega as próximas 10 da lista (rotação circular)
    const maxPerCycle = 10;
    const startIndex = keywordRotationIndex % allKeywords.length;
    let selectedKeywords = [];
    
    for (let i = 0; i < Math.min(maxPerCycle, allKeywords.length); i++) {
        const idx = (startIndex + i) % allKeywords.length;
        selectedKeywords.push(allKeywords[idx]);
    }
    
    keywordRotationIndex = (startIndex + maxPerCycle) % allKeywords.length;
    
    logger.info(`📋 Ciclo de captura: ${selectedKeywords.length} de ${allKeywords.length} keywords (Bloco a partir do #${startIndex + 1})`);
    logger.info(`📋 Keywords deste ciclo: ${selectedKeywords.join(', ')}`);
    
    let totalAddedCount = 0;
    let allProducts = [];

    for (const keyword of selectedKeywords) {
        try {
            logger.info(`🔎 Buscando por: ${keyword}`);
            const products = await mlService.searchProducts(keyword, env.mlCategory);
            logger.info(`📦 Busca por '${keyword}' retornou ${products.length} produtos.`);

            allProducts = allProducts.concat(products);

            // Aguarda pequeno intervalo para evitar bloqueio IP
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
        } catch (keywordError) {
            logger.error(`❌ Erro ao processar palavra-chave "${keyword}":`, keywordError.message);
        }
    }

    // ⭐ EMBARALHAMENTO GLOBAL: Mistura todos os itens de todas as categorias
    allProducts.sort(() => Math.random() - 0.5);
    logger.info(`🔀 Embaralhando ${allProducts.length} produtos para maior variedade na fila.`);

    for (const product of allProducts) {
        if (!product.title || !product.price || !product.link) continue;

        // Normalização básica de imagem
        if (!product.imageUrl) {
            product.imageUrl = 'https://www.mercadolivre.com.br/menu/img/logo__large_plus.png';
        }

        try {
            const rawMessage = await formatterService.generateRawMessage(product);
            const formattedMessage = await formatterService.generateFormattedMessage(product);

            const added = await queueService.addToQueue(product, rawMessage, formattedMessage);
            if (added) {
                totalAddedCount++;
            }
        } catch (fmtErr) {
            logger.warn(`⚠️ Erro ao formatar/enfileirar "${product.title}": ${fmtErr.message}`);
        }
    }

    logger.info(`✅ Job de captura finalizado. ${totalAddedCount} novos produtos adicionados à fila.`);

    // Disparar publicação após terminar todas as capturas
    const { publishTask } = require('./publisher.job');
    publishTask().catch(err => logger.error('Erro ao disparar publisher após captura:', err));

  } catch (error) {
    logger.error('❌ Erro crítico no job de captura multi-item:', error);
  }
};

const startCaptureJob = () => {
  logger.info(`Agendando job de captura com cron: ${env.cronCaptureSchedule}`);
  cron.schedule(env.cronCaptureSchedule, captureTask);

  // Disparo inicial após 10 segundos para resultados imediatos
  logger.info('🚀 Agendando captura inicial para 10 segundos após o boot...');
  setTimeout(() => {
      captureTask().catch(err => logger.error('Erro na captura inicial:', err));
  }, env.initialCaptureDelay);
};

module.exports = { startCaptureJob, captureTask };
