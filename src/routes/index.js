const express = require('express');
const router = express.Router();
const repository = require('../database/repository');
const logger = require('../config/logger');
const { captureTask } = require('../jobs/capture.job');
const { publishTask } = require('../jobs/publisher.job');
const couponFetcher = require('../services/couponFetcher.service');

// Listar fila
router.get('/queue', async (req, res) => {
    const status = req.query.status || 'approved';
    const items = await repository.getQueue(status);
    res.json(items);
});

// Forçar Captura Manual (Útil para testes)
router.get('/capture/force', async (req, res) => {
    logger.info('Solicitação de captura manual recebida via API.');
    res.json({ message: 'Captura iniciada em background. Verifique se novos itens aparecem em /api/queue?status=approved' });
    captureTask().catch(err => logger.error('Erro na captura manual:', err));
});

// Forçar Publicação Manual
router.get('/publish/force', async (req, res) => {
    logger.info('Solicitação de publicação manual recebida via API.');
    res.json({ message: 'Tentativa de publicação iniciada. Acompanhe os logs!' });
    publishTask().catch(err => logger.error('Erro na publicação manual:', err));
});

// Testar Scraper
router.get('/search/test', async (req, res) => {
    const q = req.query.q || 'Xiaomi';
    const mlService = require('../services/mercadoLivre.service');
    logger.info(`Teste de busca manual solicitado para: ${q}`);
    try {
        const products = await mlService.searchProducts(q);
        res.json({ 
            query: q, 
            count: products.length, 
            products: products.map(p => ({
                id: p.id,
                title: p.title,
                price: p.price,
                link: p.link,
                hasImage: !!p.imageUrl
            }))
        });
    } catch (err) {
        logger.error('Erro no teste de busca manual:', err);
        res.status(500).json({ error: err.message });
    }
});

// Limpar Banco de Dados Total (Novos nichos)
router.get('/database/clear', async (req, res) => {
    logger.info('Solicitação de limpeza total do banco recebida.');
    try {
        await repository.clearQueue();
        res.json({ success: true, message: 'Banco de dados e fila limpos com sucesso! O bot agora buscará apenas os novos nichos.' });
    } catch (err) {
        logger.error('Erro ao limpar banco via API:', err);
        res.status(500).json({ error: err.message });
    }
});


// Cupons do dia (busca do banco de dados com fallback para cache em memória)
router.get('/coupons/daily', async (req, res) => {
    try {
        let coupons = await repository.getActiveCoupons();
        if (!coupons || coupons.length === 0) {
            coupons = couponFetcher.getCachedCoupons();
        }
        const cacheInfo = couponFetcher.getCacheInfo();
        const activeCoupon = await couponFetcher.getActiveDailyCoupon();
        res.json({ coupons, cacheInfo, activeCoupon });
    } catch (err) {
        logger.error('Erro ao buscar cupons diários:', err);
        res.status(500).json({ error: err.message });
    }
});

// Cadastrar ou atualizar cupom manualmente no banco de dados
router.post('/coupons', async (req, res) => {
    try {
        const { code, description, rule, category, minAmount, discountValue, discountType } = req.body;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'O campo "code" é obrigatório.' });
        }

        const saved = await repository.saveCoupon({
            code: code.trim().toUpperCase(),
            description: description || `Cupom ${code}`,
            rule: rule || description || '',
            category: category || null,
            minAmount: minAmount !== undefined ? parseFloat(minAmount) : 0,
            discountValue: discountValue !== undefined ? parseFloat(discountValue) : null,
            discountType: discountType || 'unknown',
            source: 'manual_api',
            isActive: 1
        });

        // Atualiza cache em memória
        await couponFetcher.fetchDailyCoupons(true);

        res.json({ success: true, message: `Cupom ${code.trim().toUpperCase()} salvo com sucesso no banco de dados!` });
    } catch (err) {
        logger.error('Erro ao cadastrar cupom via API:', err);
        res.status(500).json({ error: err.message });
    }
});

// Força atualização imediata do cache e banco de cupons do dia
router.get('/coupons/daily/refresh', async (req, res) => {
    try {
        logger.info('[API] Refresh manual de cupons do dia solicitado.');
        couponFetcher.fetchDailyCoupons(true).catch(e => logger.warn(`Erro no refresh de cupons: ${e.message}`));
        res.json({ message: 'Refresh de cupons iniciado em background.' });
    } catch (err) {
        logger.error('Erro ao iniciar refresh de cupons:', err);
        res.status(500).json({ error: err.message });
    }
});

// Obter cupom ativo atual
router.get('/coupons/active', async (req, res) => {
    try {
        const active = await couponFetcher.getActiveDailyCoupon();
        res.json({ activeCoupon: active });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Definir manualmente o cupom ativo do dia (ou limpar para modo automático)
router.post('/coupons/active', async (req, res) => {
    try {
        const { coupon } = req.body;
        await couponFetcher.setActiveDailyCoupon(coupon);
        const active = await couponFetcher.getActiveDailyCoupon();
        res.json({ success: true, activeCoupon: active, message: active ? `Cupom ${active} ativado com sucesso!` : 'Modo automático reativado!' });
    } catch (err) {
        logger.error('Erro ao definir cupom ativo:', err);
        res.status(500).json({ error: err.message });
    }
});

// Testar associação de cupom para um produto (preview do melhor cupom)
router.get('/coupons/match', async (req, res) => {
    try {
        const { price, title } = req.query;
        if (!title && !price) {
            return res.status(400).json({ error: 'Forneça ao menos "title" ou "price" na query string.' });
        }
        const matched = await couponFetcher.findBestCouponForProduct({
            title: title || 'Produto Teste',
            price: price ? parseFloat(price) : 100
        });
        res.json({
            product: { title: title || 'Produto Teste', price: price ? parseFloat(price) : 100 },
            matchedCoupon: matched
        });
    } catch (err) {
        logger.error('Erro ao testar match de cupom:', err);
        res.status(500).json({ error: err.message });
    }
});
// ──────────────────────────────────────────────────────────────────────────────
// ENDPOINTS DO NOVO MOTOR DE PROMOÇÕES (EXTRATOR, MARCA D'ÁGUA, AFILIADO E ENVIO)
// ──────────────────────────────────────────────────────────────────────────────
const promoParser = require('../services/promoParser.service');
const whatsappSender = require('../services/whatsappSender.service');

// 1. Extrair e raspar promoção a partir de texto bruto ou URL
router.post('/promo/parse', async (req, res) => {
    try {
        const { text, url } = req.body;
        if (!text && !url) {
            return res.status(400).json({ error: 'Informe "text" ou "url" no corpo da requisição.' });
        }
        if (text) {
            const result = await promoParser.parsePromotion(text);
            return res.json(result);
        }
        const cleanUrl = await promoParser.unshortenUrl(url);
        const product = await promoParser.scrapeProductData(cleanUrl);
        return res.json({ found: true, cleanUrl, product });
    } catch (err) {
        logger.error('[API /promo/parse] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 2. Gerar pré-visualização completa (legenda oficial + link meli.la + imagem com marca d'água)
router.post('/promo/preview', async (req, res) => {
    try {
        const preview = await whatsappSender.previewPromotion(req.body);
        return res.json(preview);
    } catch (err) {
        logger.error('[API /promo/preview] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 3. Processar e publicar imediatamente no grupo do WhatsApp
router.post('/promo/publish', async (req, res) => {
    try {
        const { targetChatId, ...input } = req.body;
        const result = await whatsappSender.sendPromotion(input, targetChatId);
        return res.json(result);
    } catch (err) {
        logger.error('[API /promo/publish] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 4. Listar canais do WhatsApp aos quais o bot tem acesso
router.get('/whatsapp/channels', async (req, res) => {
    const whatsappPublisher = require('../publishers/whatsapp.publisher');
    try {
        const channels = await whatsappPublisher.getSubscribedChannels();
        const currentDest = await whatsappPublisher.getDestinationInfo();
        return res.json({ success: true, currentDestination: currentDest, channels });
    } catch (err) {
        logger.error('[API /whatsapp/channels] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 5. Testar envio de mensagem no canal/grupo configurado
router.post('/whatsapp/test', async (req, res) => {
    const whatsappPublisher = require('../publishers/whatsapp.publisher');
    const { target, message } = req.body;
    try {
        const testText = message || '🚀 *OfertaLar Bot:* Teste de envio realizado com sucesso no canal do WhatsApp!';
        const sent = await whatsappPublisher.sendTextMessage(testText, target || null);
        const dest = await whatsappPublisher.getDestinationInfo();
        if (sent) {
            return res.json({ success: true, message: 'Mensagem de teste enviada com sucesso!', destination: dest });
        } else {
            return res.status(500).json({ success: false, error: 'Falha ao enviar mensagem de teste. Verifique se o WhatsApp está conectado e se o canal foi encontrado.', destination: dest });
        }
    } catch (err) {
        logger.error('[API /whatsapp/test] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;

