const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const { enrichProductDetails } = require('../services/mercadoLivre.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');

// Índice global para rotacionar as keywords a cada ciclo
let keywordRotationIndex = 0;

const captureTask = async () => {
  logger.info('🚀 Iniciando job de captura multi-item do ML...');
  try {
    const repository = require('../database/repository');
    await repository.pruneOldProducts();

    let keywordsString = env.mlSearchKeyword || '';
    const allKeywords = keywordsString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    if (allKeywords.length === 0) {
        logger.warn('⚠️ Nenhuma keyword configurada! Verifique ML_SEARCH_KEYWORD.');
        return;
    }

    // ⭐ EMBARALHAMENTO DE KEYWORDS: Garante que cada ciclo de captura seja imprevisível
    allKeywords.sort(() => Math.random() - 0.5);

    // 🔄 ROTAÇÃO: Processa pouquíssimas keywords por ciclo para evitar OOM no Render
    // A cada execução, pega apenas 3 da lista para manter o heap baixo
    const maxPerCycle = 3;
    const startIndex = keywordRotationIndex % allKeywords.length;
    let selectedKeywords = [];
    
    for (let i = 0; i < Math.min(maxPerCycle, allKeywords.length); i++) {
        const idx = (startIndex + i) % allKeywords.length;
        selectedKeywords.push(allKeywords[idx]);
    }
    
    keywordRotationIndex = (startIndex + maxPerCycle) % allKeywords.length;
    
    logger.info(`📋 Ciclo de captura: ${selectedKeywords.length} de ${allKeywords.length} keywords (Bloco a partir do #${startIndex + 1})`);
    logger.info(`📋 Keywords deste ciclo: ${selectedKeywords.join(', ')}`);
    
    const allProductsInCycle = [];
    
    // ❌ Ofertas do Dia (Produtos Premium) desativado para respeitar rigorosamente o nicho (CASA) configurado.
    
    for (const keyword of selectedKeywords) {
        try {
            logger.info(`🔎 Buscando por: ${keyword}`);
            const products = await mlService.searchProducts(keyword, env.mlCategory);
            logger.info(`📦 Busca por '${keyword}' retornou ${products.length} produtos.`);

            if (products.length > 0) {
                allProductsInCycle.push(...products);
            }

            // Aguarda pequeno intervalo para evitar bloqueio IP
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        } catch (keywordError) {
            logger.error(`❌ Erro ao processar palavra-chave "${keyword}":`, keywordError.message);
        }
    }

    // ⭐ EMBARALHAMENTO TOTAL DO CICLO: Mistura produtos de diferentes keywords
    // Isso evita postar 10 lixeiras seguidas se a keyword 'Lixeira' for processada.
    allProductsInCycle.sort(() => Math.random() - 0.5);

    let totalAddedCount = 0;
    for (const product of allProductsInCycle) {
        if (!product.title || !product.price || !product.link) continue;

        // Normalização básica de imagem
        if (!product.imageUrl) {
            product.imageUrl = 'https://www.mercadolivre.com.br/menu/img/logo__large_plus.png';
        }

        try {
            // 1. Gerar o link oficial de afiliado e validar
            const finalLink = await formatterService.formatLink(product.link);
            if (!finalLink || !finalLink.includes('meli.la')) {
                logger.warn(`⏩ Ignorando produto "${product.title}" pois não foi possível gerar um link oficial meli.la.`);
                continue;
            }

            // Enriquecer detalhes do produto (com timeout de 5s para não travar o ciclo)
            let enrichedProduct = product;
            try {
                const enrichPromise = enrichProductDetails(product);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout enriquecimento')), 5000));
                enrichedProduct = await Promise.race([enrichPromise, timeoutPromise]);
            } catch (enrichErr) {
                // Se enriquecimento falhar ou demorar, usa o produto básico mesmo
                logger.debug(`⏩ Enriquecimento pulado para "${product.title}": ${enrichErr.message}`);
                enrichedProduct = product;
            }

            // Salva o link original e o de afiliado oficial no produto
            enrichedProduct.originalLink = product.link;
            enrichedProduct.link = finalLink;

            // Não armazena as mensagens no banco para economizar espaço
            const added = await queueService.addToQueue(enrichedProduct, '', '');
            if (added) {
                totalAddedCount++;
            }
        } catch (fmtErr) {
            logger.warn(`⚠️ Erro ao formatar/enfileirar "${product.title}": ${fmtErr.message}`);
        }
    }

    logger.info(`✅ Job de captura finalizado. ${totalAddedCount} novos produtos adicionados à fila.`);

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
