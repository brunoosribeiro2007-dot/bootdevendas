/**
 * ==============================================================================
 * CAPTURE JOB - ROTINA DE CAPTURA E ENFILEIRAMENTO MULTI-ITEM
 * ==============================================================================
 * Responsabilidades deste módulo:
 * 1. Monitorar e capturar ofertas quentes no Mercado Livre (abas oficiais e busca).
 * 2. Buscar ofertas na Shopee (quando configurada).
 * 3. Rotacionar palavras-chave do nicho Casa/Eletrodomésticos para não sobrecarregar.
 * 4. Pré-filtrar itens duplicados (por ID, título similar ou imagem).
 * 5. Gerar links oficiais de afiliado e enfileirar para publicação no WhatsApp.
 * ==============================================================================
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const mlService = require('../services/mercadoLivre.service');
const shopeeService = require('../services/shopee.service');
const formatterService = require('../services/formatter.service');
const queueService = require('../services/queue.service');
const couponFetcher = require('../services/couponFetcher.service');

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: ESTADO GLOBAL DO JOB
// ──────────────────────────────────────────────────────────────────────────────

// Controla qual fatia da lista de palavras-chave será processada no ciclo atual
let keywordRotationIndex = 0;

// Trava atômica de concorrência para impedir múltiplos ciclos simultâneos
let isCapturing = false;

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: HELPERS DE NORMALIZAÇÃO E DESDUPLICAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extrai o identificador numérico MLB de um link do Mercado Livre.
 * @param {string} link - URL do anúncio.
 * @returns {string|null} ID numérico do produto ou null.
 */
const extractMlbId = (link) => {
  if (!link || typeof link !== 'string') return null;
  const match = link.match(/MLB-?(\d+)/i);
  return match ? match[1] : null;
};

/**
 * Extrai o identificador único da imagem hospedada na CDN (mlstatic ou Shopee)
 * para identificar fotos idênticas mesmo que o anúncio seja recriado.
 * @param {string} url - URL da imagem.
 * @returns {string|null} Identificador da imagem.
 */
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

/**
 * Normaliza títulos de produtos removendo acentuações, símbolos e termos de voltagem,
 * permitindo comparação semântica precisa entre títulos.
 * @param {string} title - Título bruto.
 * @returns {string} Título sanitizado e unificado.
 */
const normalizeTitle = (title) => {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\b(110v|220v|127v|bivolt|volts|volt)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Avalia se dois títulos são praticamente o mesmo produto usando sobreposição de termos.
 * Retorna true se houver 70% ou mais de palavras idênticas.
 * @param {string} n1 - Primeiro título normalizado.
 * @param {string} n2 - Segundo título normalizado.
 * @returns {boolean} True se forem considerados o mesmo produto.
 */
const titlesAreSimilar = (n1, n2) => {
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  const w1 = n1.split(' ').filter(w => w.length > 1);
  const w2 = n2.split(' ').filter(w => w.length > 1);
  if (!w1.length || !w2.length) return false;

  const common = w1.filter(w => w2.includes(w));
  return common.length / Math.min(w1.length, w2.length) >= 0.7;
};

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 3: CICLO PRINCIPAL DE CAPTURA (captureTask)
// ──────────────────────────────────────────────────────────────────────────────

const captureTask = async () => {
  if (isCapturing) {
    logger.warn('⚠️ [CaptureTask] Captura já está em andamento. Ignorando chamada concorrente.');
    return;
  }
  isCapturing = true;
  logger.info('🚀 Iniciando job de captura multi-item do ML...');

  try {
    // 1. Atualiza cache de cupons válidos do dia em segundo plano
    couponFetcher.fetchDailyCoupons().catch(e => {
      logger.warn(`[CaptureJob] Erro ao buscar cupons do dia: ${e.message}`);
    });

    // 2. Limpeza preventiva de registros antigos no banco de dados
    const repository = require('../database/repository');
    await repository.pruneOldProducts();

    // 3. Pré-carregamento em memória de IDs e títulos existentes para deduplicação rápida
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

    // 4. Seleção e rotação de palavras-chave para o ciclo atual
    const keywordsString = env.mlSearchKeyword || '';
    const allKeywords = keywordsString
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (allKeywords.length === 0) {
      logger.warn('⚠️ Nenhuma keyword configurada! Verifique ML_SEARCH_KEYWORD.');
      return;
    }

    const maxPerCycle = 5; // Limita a 5 palavras por ciclo para economizar RAM no Render
    const startIndex = keywordRotationIndex % allKeywords.length;
    const selectedKeywords = [];

    for (let i = 0; i < Math.min(maxPerCycle, allKeywords.length); i++) {
      const idx = (startIndex + i) % allKeywords.length;
      selectedKeywords.push(allKeywords[idx]);
    }
    keywordRotationIndex = (startIndex + maxPerCycle) % allKeywords.length;

    logger.info(`📋 Ciclo de captura: ${selectedKeywords.length} de ${allKeywords.length} keywords (Bloco #${startIndex + 1})`);
    logger.info(`📋 Keywords deste ciclo: ${selectedKeywords.join(', ')}`);

    const allProductsInCycle = [];

    // ─── 5. Captura das Abas Oficiais de Ofertas do Mercado Livre ──────────────
    // Categorias: MLB1574 (Casa/Decoração) e MLB5726 (Eletro) para Casa; MLB1648 (Informática) para PC Gamer
    const dealsCategories = env.niche === 'pc_gamer' ? ['MLB1648'] : ['MLB1574', 'MLB5726'];
    const dealsOffsets = [1, 49, 97, 145, 193]; // 5 páginas por categoria

    logger.info('🔥 Coletando ofertas reais das abas oficiais de promoções do Mercado Livre...');
    for (const catId of dealsCategories) {
      for (const offset of dealsOffsets) {
        try {
          const deals = await mlService.searchDealsByCategory(catId, offset);
          if (deals && deals.length > 0) {
            allProductsInCycle.push(...deals);
          }
          // Pausa entre requisições para evitar rate-limit
          await new Promise(r => setTimeout(r, 800));
        } catch (err) {
          logger.error(`❌ Erro ao capturar aba de ofertas para categoria ${catId} (offset ${offset}): ${err.message}`);
        }
      }
    }

    // ─── 6. Captura por Palavras-Chave (Mercado Livre e Shopee) ───────────────
    for (const keyword of selectedKeywords) {
      try {
        logger.info(`🔎 Buscando por: ${keyword}`);

        // Busca no Mercado Livre
        const mlProducts = await mlService.searchProducts(keyword, env.mlCategory);
        logger.info(`📦 Busca no ML por '${keyword}' retornou ${mlProducts.length} produtos.`);
        if (mlProducts.length > 0) {
          allProductsInCycle.push(...mlProducts);
        }

        // Busca na Shopee (caso ativada)
        if (env.useShopee && env.shopeeAppId && env.shopeeSecret) {
          const shopeeProducts = await shopeeService.searchProducts(keyword);
          logger.info(`📦 Busca na Shopee por '${keyword}' retornou ${shopeeProducts.length} produtos.`);
          if (shopeeProducts.length > 0) {
            allProductsInCycle.push(...shopeeProducts);
          }
        }

        // Intervalo de segurança com jitter entre termos
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
      } catch (keywordError) {
        logger.error(`❌ Erro ao processar palavra-chave "${keyword}": ${keywordError.message}`);
      }
    }

    // ─── 7. Embaralhamento para Variedade de Conteúdo ─────────────────────────
    allProductsInCycle.sort(() => Math.random() - 0.5);

    // ─── 8. Validação, Geração de Links Oficiais e Enfileiramento ─────────────
    let totalAddedCount = 0;

    for (const product of allProductsInCycle) {
      if (!product.title || !product.price || !product.link) continue;

      // 🛡️ VALIDAÇÃO RIGOROSA DE QUALIDADE E REPUTAÇÃO DO PRODUTO
      // Exige: >= 100 avaliações de compradores, nota média >= 4.5, promoção/desconto ativo e vendedor qualificado
      if (!mlService.validarQualidadeProduto(product)) {
        const motivo = mlService.obterMotivoReprovacao ? mlService.obterMotivoReprovacao(product) : `Avaliações: ${product.reviewsCount || 0}, Nota: ${product.rating || 0}, Desconto: ${product.discountPercent || 0}%`;
        logger.info(`⏩ [Qualidade] Produto ignorado: "${product.title}" (${motivo})`);
        continue; // Ignora o item que não atinge os critérios e busca o próximo da fila
      }

      // Pré-checagem de duplicidade por ID MLB
      const mlbId = extractMlbId(product.link);
      if (mlbId && existingMlbIds.has(mlbId)) {
        logger.debug(`⏩ Pré-checagem: MLB${mlbId} já existe. Pulando.`);
        continue;
      }

      // Pré-checagem de duplicidade por título similar
      const titleNorm = normalizeTitle(product.title);
      if (titleNorm && existingTitles.some(t => {
        const tn = normalizeTitle(t);
        return tn === titleNorm || titlesAreSimilar(titleNorm, tn);
      })) {
        logger.debug(`⏩ Pré-checagem: Título similar já existe: "${product.title}". Pulando.`);
        continue;
      }

      // Pré-checagem de duplicidade por ID de imagem
      const imgId = product.imageUrl ? extractImageId(product.imageUrl) : null;
      if (imgId && existingImageIds.has(imgId)) {
        logger.debug(`⏩ Pré-checagem: Imagem duplicada. Pulando "${product.title}".`);
        continue;
      }

      // Imagem padrão caso o produto venha sem imagem
      if (!product.imageUrl) {
        product.imageUrl = 'https://www.mercadolivre.com.br/menu/img/logo__large_plus.png';
      }

      try {
        // Gera o link oficial encurtado com rastreamento de afiliado
        const finalLink = await formatterService.formatLink(product.link);
        const isMeliLink = finalLink && (finalLink.includes('meli.la') || finalLink.includes('mercadolivre.com') || finalLink.includes('mercadolivre.com.br'));
        const isShopeeLink = finalLink && (finalLink.includes('shope.ee') || finalLink.includes('shopee.com.br'));

        if (!finalLink || (!isMeliLink && !isShopeeLink)) {
          logger.warn(`⏩ Ignorando produto "${product.title}" pois não foi possível gerar um link oficial.`);
          continue;
        }

        product.originalLink = product.link;
        product.link = finalLink;

        // Salva na fila de publicações aprovadas
        const added = await queueService.addToQueue(product, '', '');
        if (added) {
          totalAddedCount++;
          // Se o produto possuir cupom real, salva no banco para exibição imediata no painel
          if (product.coupon) {
            try {
              const repository = require('../database/repository');
              const cObj = typeof product.coupon === 'object' ? product.coupon : { code: String(product.coupon) };
              if (cObj.code) {
                await repository.saveCoupon({
                  code: cObj.code,
                  description: cObj.rule || cObj.description || `Cupom ${cObj.code} no Mercado Livre`,
                  rule: cObj.rule || cObj.description || 'Desconto no anúncio',
                  minAmount: cObj.minAmount || 0,
                  category: env.niche,
                  source: 'ml_product_capture',
                  isActive: 1
                });
              }
            } catch (_) {}
          }
          // Atualiza o cache local para evitar duplicações no mesmo lote
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

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 4: AGENDAMENTO DO JOB (CRON E BOOT)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Registra a rotina de captura no agendador cron e agenda o primeiro disparo logo após o boot.
 */
const startCaptureJob = () => {
  logger.info(`Agendando job de captura com cron: ${env.cronCaptureSchedule}`);
  cron.schedule(env.cronCaptureSchedule, captureTask);

  // Disparo inicial após 10 segundos para carregar o catálogo logo após a subida do servidor
  logger.info('🚀 Agendando captura inicial para 10 segundos após o boot...');
  setTimeout(() => {
    captureTask().catch(err => logger.error('Erro na captura inicial:', err));
  }, env.initialCaptureDelay);
};

module.exports = { startCaptureJob, captureTask };
