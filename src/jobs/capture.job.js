const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const shopeeService = require('../services/shopee.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');
const couponFetcher = require('../services/couponFetcher.service');

// Índice global para rotacionar as keywords a cada ciclo
let keywordRotationIndex = 0;
let isCapturing = false;

const captureTask = async () => {
  if (isCapturing) {
      logger.warn('⚠️ [CaptureTask] Captura já está em andamento. Ignorando chamada concorrente.');
      return;
  }
  isCapturing = true;
  logger.info('🚀 Iniciando job de captura multi-item do ML...');
  try {
    // 🏷️ Renova o cache de cupons do dia antes de iniciar a captura
    couponFetcher.fetchDailyCoupons().catch(e => logger.warn(`[CaptureJob] Erro ao buscar cupons do dia: ${e.message}`));

    const repository = require('../database/repository');
    await repository.pruneOldProducts();

    // ─── Pré-carrega IDs e títulos existentes para checagem rápida de duplicados ───
    const existingProducts = await repository.getAllProductsBasic();
    const existingMlbIds = new Set();
    const existingTitles = [];
    const existingImageIds = new Set();
    for (const p of existingProducts) {
        const mlbId = extractMlbId(p.original_link || p.link);
        if (mlbId) existingMlbIds.add(mlbId);
        if (p.title) existingTitles.push(p.title);
        if (p.image_url) {
            const imgId = extractImageId(p.image_url);
            if (imgId) existingImageIds.add(imgId);
        }
    }

    let keywordsString = env.mlSearchKeyword || '';
    const allKeywords = keywordsString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    if (allKeywords.length === 0) {
        logger.warn('⚠️ Nenhuma keyword configurada! Verifique ML_SEARCH_KEYWORD.');
        return;
    }
    // 🔄 ROTAÇÃO: Processa pouquíssimas keywords por ciclo para evitar OOM no Render
    const maxPerCycle = 5;
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
    
    // 🚀 Ofertas das Abas Oficiais do Mercado Livre — 5 páginas por categoria (Casa e Eletrodomésticos)
    // ⚠️ MLB1246 (Beleza) removido — fora do nicho Casa
    const dealsCategories = ['MLB1574', 'MLB5726'];
    // offsets: 1=pág1, 49=pág2, 97=pág3, 145=pág4, 193=pág5
    const dealsOffsets = [1, 49, 97, 145, 193];
    logger.info('🔥 Coletando ofertas reais das abas oficiais de promoções do Mercado Livre...');
    for (const catId of dealsCategories) {
        for (const offset of dealsOffsets) {
            try {
                const deals = await mlService.searchDealsByCategory(catId, offset);
                if (deals && deals.length > 0) {
                    allProductsInCycle.push(...deals);
                }
                // Pequena pausa entre páginas para evitar bloqueio
                await new Promise(r => setTimeout(r, 800));
            } catch (err) {
                logger.error(`❌ Erro ao capturar aba de ofertas para a categoria ${catId} (offset ${offset}): ${err.message}`);
            }
        }
    }
    
    for (const keyword of selectedKeywords) {
        try {
            logger.info(`🔎 Buscando por: ${keyword}`);
            
            // Busca Mercado Livre
            const mlProducts = await mlService.searchProducts(keyword, env.mlCategory);
            logger.info(`📦 Busca no ML por '${keyword}' retornou ${mlProducts.length} produtos.`);
            if (mlProducts.length > 0) {
                allProductsInCycle.push(...mlProducts);
            }

            // Busca Shopee (se ativado)
            if (env.useShopee && env.shopeeAppId && env.shopeeSecret) {
                const shopeeProducts = await shopeeService.searchProducts(keyword);
                logger.info(`📦 Busca na Shopee por '${keyword}' retornou ${shopeeProducts.length} produtos.`);
                if (shopeeProducts.length > 0) {
                    allProductsInCycle.push(...shopeeProducts);
                }
            }

            // Aguarda pequeno intervalo para evitar bloqueio IP
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        } catch (keywordError) {
            logger.error(`❌ Erro ao processar palavra-chave "${keyword}": ${keywordError.message}`);
        }
    }

    // ⭐ EMBARALHAMENTO TOTAL DO CICLO: Mistura produtos de diferentes keywords
    allProductsInCycle.sort(() => Math.random() - 0.5);

    let totalAddedCount = 0;
    for (const product of allProductsInCycle) {
        if (!product.title || !product.price || !product.link) continue;

        // ─── PRÉ-CHECAGEM RÁPIDA DE DUPLICADOS (antes de gastar créditos de link) ───
        const mlbId = extractMlbId(product.link);
        if (mlbId && existingMlbIds.has(mlbId)) {
            logger.debug(`⏩ Pré-checagem: MLB${mlbId} já existe. Pulando.`);
            continue;
        }
        const titleNorm = normalizeTitle(product.title);
        if (titleNorm && existingTitles.some(t => {
            const tn = normalizeTitle(t);
            return tn === titleNorm || titlesAreSimilar(titleNorm, tn);
        })) {
            logger.debug(`⏩ Pré-checagem: Título similar já existe: "${product.title}". Pulando.`);
            continue;
        }
        const imgId = product.imageUrl ? extractImageId(product.imageUrl) : null;
        if (imgId && existingImageIds.has(imgId)) {
            logger.debug(`⏩ Pré-checagem: Imagem duplicada. Pulando "${product.title}".`);
            continue;
        }

        // Normalização básica de imagem
        if (!product.imageUrl) {
            product.imageUrl = 'https://www.mercadolivre.com.br/menu/img/logo__large_plus.png';
        }

        try {
            // 1. Gerar o link oficial de afiliado e validar
            const finalLink = await formatterService.formatLink(product.link);
            const isMeliLink = finalLink && finalLink.includes('meli.la');
            const isShopeeLink = finalLink && (finalLink.includes('shope.ee') || finalLink.includes('shopee.com.br') || finalLink.includes('tinyurl.com') || finalLink.includes('is.gd') || finalLink.includes('v.gd'));
            
            if (!finalLink || (!isMeliLink && !isShopeeLink)) {
                logger.warn(`⏩ Ignorando produto "${product.title}" pois não foi possível gerar um link oficial ou encurtado.`);
                continue;
            }

            // Salva o link original e o de afiliado oficial no produto
            product.originalLink = product.link;
            product.link = finalLink;

            // Não armazena as mensagens no banco para economizar espaço
            const added = await queueService.addToQueue(product, '', '');
            if (added) {
                totalAddedCount++;
                // Adiciona ao cache local para evitar duplicados dentro do mesmo ciclo
                if (mlbId) existingMlbIds.add(mlbId);
                existingTitles.push(product.title);
                if (imgId) existingImageIds.add(imgId);
            }
        } catch (fmtErr) {
            logger.warn(`⚠️ Erro ao formatar/enfileirar "${product.title}": ${fmtErr.message}`);
        }
    }

    logger.info(`✅ Job de captura finalizado. ${totalAddedCount} novos produtos adicionados à fila.`);

  } catch (error) {
    logger.error('❌ Erro crítico no job de captura multi-item:', error);
  } finally {
    isCapturing = false;
  }
};

// ─── Helpers locais para pré-checagem de duplicados ───────────────────────────
const extractMlbId = (link) => {
    if (!link || typeof link !== 'string') return null;
    const match = link.match(/MLB-?(\d+)/i);
    return match ? match[1] : null;
};

const extractImageId = (url) => {
    if (!url || typeof url !== 'string') return null;
    const clean = url.split('?')[0].split('#')[0];
    if (clean.includes('mlstatic.com')) {
        const match = clean.match(/D_(?:NQ|Q)_NP_(?:2X_)?([a-zA-Z0-9_-]+)-[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/i);
        if (match) return match[1];
        const parts = clean.split('/');
        const filename = parts[parts.length - 1];
        const baseMatch = filename.match(/^(.+)-[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/i);
        if (baseMatch) return baseMatch[1];
        return filename;
    }
    const parts = clean.split('/');
    return parts[parts.length - 1] || clean;
};

const normalizeTitle = (title) => {
    if (!title || typeof title !== 'string') return '';
    return title.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\b(110v|220v|127v|bivolt|volts|volt)\b/g, '')
        .replace(/\s+/g, ' ').trim();
};

const titlesAreSimilar = (n1, n2) => {
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    const w1 = n1.split(' ').filter(w => w.length > 1);
    const w2 = n2.split(' ').filter(w => w.length > 1);
    if (!w1.length || !w2.length) return false;
    const common = w1.filter(w => w2.includes(w));
    return common.length / Math.min(w1.length, w2.length) >= 0.7;
};
// ─────────────────────────────────────────────────────────────────────────────

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


