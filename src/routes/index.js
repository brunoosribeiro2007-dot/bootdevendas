const express = require('express');
const router = express.Router();
const repository = require('../database/repository');
const logger = require('../config/logger');
const { captureTask } = require('../jobs/capture.job');
const { publishTask } = require('../jobs/publisher.job');
const couponFetcher = require('../services/couponFetcher.service');
const whatsappPublisher = require('../publishers/whatsapp.publisher');

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

// Forçar Publicação Manual (Bypass de horário permitido para testes)
router.get('/publish/force', async (req, res) => {
    logger.info('Solicitação de publicação manual recebida via API.');
    res.json({ message: 'Tentativa de publicação iniciada para todos os destinos configurados. Acompanhe os logs!' });
    publishTask(true).catch(err => logger.error('Erro na publicação manual:', err));
});

// Forçar Envio Manual das Mensagens de Convite / Compartilhamento
router.get('/invite/force', async (req, res) => {
    logger.info('Solicitação de envio manual de convite recebida via API.');
    const { sendInviteTask } = require('../jobs/invite.job');
    sendInviteTask(true)
        .then(result => logger.info('Resultado do envio manual de convite:', result))
        .catch(err => logger.error('Erro no envio manual de convite:', err));
    res.json({ message: 'Disparo de mensagens de convite iniciado em background. Acompanhe os logs!' });
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

// Desconectar e Resetar Sessão do WhatsApp (limpa Bad MAC e credenciais antigas)
router.post('/whatsapp/disconnect', async (req, res) => {
    logger.info('Solicitação de reset/desconexão da sessão do WhatsApp recebida.');
    try {
        await whatsappPublisher.disconnectAndResetSession();
        res.json({ success: true, message: 'Sessão do WhatsApp limpa com sucesso. Um novo QR Code está sendo gerado.' });
    } catch (err) {
        logger.error('Erro ao desconectar WhatsApp:', err);
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
        let coupons = await couponFetcher.fetchDailyCoupons();
        if (!coupons || coupons.length === 0) {
            coupons = await repository.getActiveCoupons();
        }
        const cacheInfo = couponFetcher.getCacheInfo();
        const activeCoupon = await couponFetcher.getActiveDailyCoupon();
        const normalized = (coupons || []).map(c => ({
            code: c.code,
            rule: c.rule || c.discount || c.description || '',
            discount: c.rule || c.discount || (c.discountValue ? `${c.discountValue}%` : ''),
            description: c.description || c.rule || '',
            minAmount: c.minAmount !== undefined ? c.minAmount : (c.min_amount || 0),
            source: c.source || 'ml_cupons_page'
        }));
        res.json({ coupons: normalized, cacheInfo, activeCoupon });
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

        await repository.saveCoupon({
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
        const updated = await couponFetcher.fetchDailyCoupons(true);
        res.json({ success: true, count: (updated || []).length, message: 'Cupons atualizados com sucesso!' });
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
        if (coupon && typeof coupon === 'string' && coupon.trim()) {
            const cleanCode = coupon.trim().toUpperCase();
            await repository.saveCoupon({
                code: cleanCode,
                description: `Cupom ${cleanCode}`,
                rule: 'Cupom ativado pelo painel',
                minAmount: 0,
                source: 'dashboard_manual',
                isActive: 1
            }).catch(() => {});
        }
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

// 3. Processar e publicar imediatamente (Canal e Grupo juntos ou targetChatId específico)
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

// 4.1. Listar grupos/comunidades do WhatsApp aos quais a conta conectada tem acesso
router.get('/whatsapp/groups', async (req, res) => {
    const whatsappPublisher = require('../publishers/whatsapp.publisher');
    try {
        const groups = await whatsappPublisher.getParticipatingGroups(true);
        const list = Object.values(groups || {}).map(g => ({
            id: g.id,
            subject: g.subject,
            isCommunity: !!g.isCommunity,
            isAnnounce: !!(g.announce || g.isCommunityAnnounce),
            participantsCount: g.participants?.length || 0
        }));
        const currentDest = await whatsappPublisher.getDestinationInfo();
        return res.json({ success: true, count: list.length, currentDestination: currentDest, groups: list });
    } catch (err) {
        logger.error('[API /whatsapp/groups] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 5. Testar envio de mensagem para todos os destinos configurados (Canal e Grupo juntos)
router.post('/whatsapp/test', async (req, res) => {
    const whatsappPublisher = require('../publishers/whatsapp.publisher');
    const { target, message } = req.body;
    try {
        if (!whatsappPublisher.isReady || !whatsappPublisher.sock) {
            return res.status(400).json({ 
                success: false, 
                error: 'WhatsApp não está conectado. Escaneie o QR Code no dashboard primeiro.' 
            });
        }
        const testText = message || '🚀 *OfertaLar Bot:* Teste de envio disparado com sucesso para o Canal e Grupo do WhatsApp!';
        const sent = await whatsappPublisher.sendTextMessage(testText, target || null);
        const dest = await whatsappPublisher.getDestinationInfo();
        if (sent) {
            return res.json({ success: true, message: 'Mensagem de teste enviada com sucesso para os destinos configurados!', destination: dest });
        } else {
            let availableGroups = [];
            try {
                const grps = await whatsappPublisher.getParticipatingGroups();
                availableGroups = Object.values(grps || {}).map(g => g.subject);
            } catch (_) {}
            return res.status(500).json({ 
                success: false, 
                error: 'Falha ao enviar mensagem de teste. Verifique se o nome do grupo está correto ou se o bot é administrador do grupo/comunidade.', 
                destination: dest,
                availableGroups
            });
        }
    } catch (err) {
        logger.error('[API /whatsapp/test] Erro:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Rota para atualizar os Cookies do Mercado Livre (para geração de links meli.la)
router.post('/cookies', async (req, res) => {
    const { cookies } = req.body || {};
    if (!cookies || typeof cookies !== 'string') {
        return res.status(400).json({ error: 'Envie { "cookies": "sua string de cookies aqui" }' });
    }
    const env = require('../config/env');
    const cleanCookies = cookies.trim();
    env.mlCookieString = cleanCookies;
    try {
        await repository.setSetting('ML_COOKIE_STRING', cleanCookies);
    } catch (e) {
        logger.warn('Falha ao persistir cookies no banco:', e.message);
    }
    logger.info('✅ Cookies do Mercado Livre atualizados com sucesso via API!');
    res.json({ success: true, message: 'Cookies atualizados com sucesso! A geração de links meli.la agora está ativa.' });
});

router.get('/cookies', async (req, res) => {
    const env = require('../config/env');
    const hasCookies = Boolean(env.mlCookieString);
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>Atualizar Cookies Mercado Livre (meli.la)</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 650px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; }
                .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
                h2 { color: #2d3748; margin-top: 0; }
                .status { padding: 10px 14px; border-radius: 6px; font-weight: bold; margin-bottom: 20px; }
                .status-active { background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; }
                .status-inactive { background: #fff5f5; color: #742a2a; border: 1px solid #fed7d7; }
                textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e0; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; }
                button { background: #3182ce; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; }
                button:hover { background: #2b6cb0; }
                code { background: #edf2f7; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🔑 Conectar Sessão do Mercado Livre para links meli.la</h2>
                <div class="status ${hasCookies ? 'status-active' : 'status-inactive'}">
                    Status: ${hasCookies ? '🟢 Cookies configurados no sistema' : '🔴 Nenhum cookie ativo (links em fallback)'}
                </div>
                <p>Para o robô gerar links oficiais <code>meli.la</code> automaticamente para cada produto, cole abaixo os cookies da sua conta de afiliado logada no Mercado Livre:</p>
                <form id="cookieForm">
                    <textarea id="cookies" rows="7" placeholder="Ex: cp=...; ssid=...; _csrf=...;"></textarea><br><br>
                    <button type="submit">Salvar Cookies e Ativar meli.la</button>
                </form>
                <p style="font-size: 13px; color: #718096; margin-top: 20px;">
                    <b>Como pegar seus cookies no computador:</b><br/>
                    1. Acesse o Mercado Livre logado na sua conta.<br/>
                    2. Pressione <code>F12</code> &gt; vá na aba <b>Rede (Network)</b> &gt; recarregue a página.<br/>
                    3. Clique em qualquer requisição para <code>mercadolivre.com.br</code> &gt; copie o cabeçalho <code>cookie</code> e cole aqui.
                </p>
            </div>
            <script>
                document.getElementById('cookieForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const val = document.getElementById('cookies').value.trim();
                    if (!val) return alert('Por favor, cole a string de cookies antes de salvar.');
                    try {
                        const res = await fetch('/cookies', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cookies: val })
                        });
                        const data = await res.json();
                        alert(data.message || data.error);
                        location.reload();
                    } catch (err) {
                        alert('Erro ao salvar cookies: ' + err.message);
                    }
                });
            </script>
        </body>
        </html>
    `);
});

module.exports = router;
