const express = require('express');
const router = express.Router();
const repository = require('../database/repository');
const logger = require('../config/logger');
const { captureTask } = require('../jobs/capture.job');
const { publishTask } = require('../jobs/publisher.job');

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

// ========== CUPONS ==========
const couponService = require('../services/coupon.service');

// Listar todos os cupons
router.get('/coupons', (req, res) => {
    const all = couponService.getAllCoupons();
    const active = couponService.getActiveCoupons();
    res.json({ total: all.length, active: active.length, coupons: all });
});

// Adicionar cupom
router.post('/coupons', (req, res) => {
    const result = couponService.addCoupon(req.body);
    if (result.success) {
        res.json({ success: true, coupons: couponService.getAllCoupons() });
    } else {
        res.status(400).json(result);
    }
});

// Remover cupom
router.delete('/coupons/:code', (req, res) => {
    const result = couponService.removeCoupon(req.params.code);
    if (result.success) {
        res.json({ success: true, coupons: couponService.getAllCoupons() });
    } else {
        res.status(404).json(result);
    }
});

// Alternar ativo/inativo
router.patch('/coupons/:code/toggle', (req, res) => {
    const result = couponService.toggleCoupon(req.params.code);
    if (result.success) {
        res.json({ success: true, active: result.active, coupons: couponService.getAllCoupons() });
    } else {
        res.status(404).json(result);
    }
});

// Preview da mensagem com cupons
router.get('/coupons/preview', (req, res) => {
    const couponsText = couponService.formatCouponsForMessage();
    res.json({ preview: couponsText || '(Nenhum cupom ativo)' });
});

module.exports = router;

