const path = require('path');
const fs = require('fs');
const { db, isPostgres } = require('./init');
const logger = require('../config/logger');
const env = require('../config/env');

let lastSentNiche = '';

const extractMlbId = (link) => {
    if (!link || typeof link !== 'string') return null;
    const match = link.match(/MLB-?(\d+)/i);
    return match ? match[1] : null;
};

const extractShopeeId = (link) => {
    if (!link || typeof link !== 'string') return null;
    const match1 = link.match(/product\/(\d+)\/(\d+)/i);
    if (match1) return match1[2];
    const match2 = link.match(/product-i\.(\d+)\.(\d+)/i);
    if (match2) return match2[2];
    const match3 = link.match(/SP-(\d+)/);
    if (match3) return match3[1];
    return null;
};

const extractImageId = (url) => {
    if (!url || typeof url !== 'string') return null;
    const clean = url.split('?')[0].split('#')[0];
    
    // Mercado Livre
    if (clean.includes('mlstatic.com')) {
        const match = clean.match(/D_(?:NQ|Q)_NP_(?:2X_)?([a-zA-Z0-9_-]+)-[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/i);
        if (match) return match[1];
        
        const parts = clean.split('/');
        const filename = parts[parts.length - 1];
        const baseMatch = filename.match(/^(.+)-[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/i);
        if (baseMatch) return baseMatch[1];
        return filename;
    }
    
    // Shopee
    if (clean.includes('shopee.com') || clean.includes('susercontent.com')) {
        const parts = clean.split('/');
        return parts[parts.length - 1] || clean;
    }
    
    // Outros
    const parts = clean.split('/');
    return parts[parts.length - 1] || clean;
};

const normalizeTitle = (title) => {
    if (!title || typeof title !== 'string') return '';
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9]/g, ' ') // Substitui símbolos por espaço
        .replace(/\b(110v|220v|127v|bivolt|volts|volt)\b/g, '') // Remove voltagem/volt
        .replace(/\s+/g, ' ') // Colapsa múltiplos espaços
        .trim();
};

const stopWords = new Set(['de', 'o', 'a', 'com', 'para', 'em', 'do', 'da', 'um', 'uma', 'sem', 'e', 'ou', 'no', 'na', 'os', 'as', 'dos', 'das', 'nos', 'nas']);

const titlesAreVerySimilar = (t1, t2) => {
    const norm1 = normalizeTitle(t1);
    const norm2 = normalizeTitle(t2);
    if (!norm1 || !norm2) return false;
    
    if (norm1 === norm2) return true;
    
    // Filtra palavras curtas e stop words, convertendo para um Set de palavras únicas
    const words1 = new Set(norm1.split(' ').filter(w => w.length > 1 && !stopWords.has(w)));
    const words2 = new Set(norm2.split(' ').filter(w => w.length > 1 && !stopWords.has(w)));
    
    if (words1.size === 0 || words2.size === 0) return false;
    
    // Encontra a interseção de termos exclusivos
    let commonCount = 0;
    for (const w of words1) {
        if (words2.has(w)) {
            commonCount++;
        }
    }
    
    const minLength = Math.min(words1.size, words2.size);
    const similarity = commonCount / minLength;
    
    // 75% de similaridade das palavras-chave relevantes
    return similarity >= 0.75;
};

const cleanLink = (url) => {
    if (!url || typeof url !== 'string') return '';
    return url.split('?')[0].split('#')[0].trim();
};

// Salva Produto com Bypass de Conflito (Postgres style)
const saveProduct = async (product) => {
    try {
        const originalLink = product.originalLink || product.link || '';
        const cleanNewLink = cleanLink(originalLink);
        
        // Busca o histórico de produtos recentes para checagem robusta em JS
        const existingProducts = await db.all("SELECT id, title, link, original_link, image_url FROM products");
        
        const normNewTitle = normalizeTitle(product.title);
        const newMlbId = extractMlbId(originalLink);
        const newShopeeId = extractShopeeId(originalLink) || extractShopeeId(product.id);
        
        for (const p of existingProducts) {
            // 1. Checagem por MLB ID
            if (newMlbId && (extractMlbId(p.original_link) === newMlbId || extractMlbId(p.link) === newMlbId)) {
                logger.info(`[SaveProduct] Produto duplicado ignorado (mesmo MLB ID no histórico). ID novo: ${product.id}, ID existente: ${p.id}`);
                return 0;
            }

            // Checagem por Shopee ID
            if (newShopeeId && (extractShopeeId(p.original_link) === newShopeeId || extractShopeeId(p.link) === newShopeeId || extractShopeeId(p.id) === newShopeeId)) {
                logger.info(`[SaveProduct] Produto duplicado ignorado (mesmo Shopee ID no histórico). ID novo: ${product.id}, ID existente: ${p.id}`);
                return 0;
            }
            
            // 2. Checagem por título normalizado ou muito similar
            if (normNewTitle) {
                const normExisting = normalizeTitle(p.title);
                if (normExisting === normNewTitle || titlesAreVerySimilar(p.title, product.title)) {
                    logger.info(`[SaveProduct] Produto duplicado ignorado (título idêntico ou muito similar no histórico). ID novo: ${product.id}, ID existente: ${p.id}, Título novo: "${product.title}", Título existente: "${p.title}"`);
                    return 0;
                }
            }
            
            // 3. Checagem por links limpos (sem parâmetros de busca/query)
            if (cleanNewLink && (cleanLink(p.original_link) === cleanNewLink || cleanLink(p.link) === cleanNewLink)) {
                logger.info(`[SaveProduct] Produto duplicado ignorado (link idêntico no histórico). ID novo: ${product.id}, ID existente: ${p.id}`);
                return 0;
            }

            // 4. Checagem por imagem idêntica (evita posts com o mesmo visual)
            if (product.imageUrl && p.image_url) {
                const newImgId = extractImageId(product.imageUrl);
                const existingImgId = extractImageId(p.image_url);
                if (newImgId && existingImgId) {
                    if (newImgId === existingImgId) {
                        logger.info(`[SaveProduct] Produto duplicado ignorado (mesmo ID de imagem no histórico). ID novo: ${product.id}, ID existente: ${p.id}, Nova Imagem: ${product.imageUrl}, Existente: ${p.image_url}`);
                        return 0;
                    }
                } else if (product.imageUrl === p.image_url) {
                    logger.info(`[SaveProduct] Produto duplicado ignorado (mesma imagem no histórico). ID novo: ${product.id}, ID existente: ${p.id}, Imagem: ${product.imageUrl}`);
                    return 0;
                }
            }
        }

        const query = `
            INSERT INTO products (id, title, price, link, original_link, image_url, description, coupon, old_price, discount_percent, rating, reviews_count, quality_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO NOTHING
        `;
        const res = await db.run(query, [
            product.id,
            product.title,
            product.price,
            product.link,
            originalLink || null,
            product.imageUrl,
            product.description,
            product.coupon || '',
            product.oldPrice !== undefined ? product.oldPrice : null,
            product.discountPercent !== undefined ? product.discountPercent : null,
            product.rating !== undefined ? product.rating : null,
            product.reviewsCount !== undefined ? product.reviewsCount : null,
            product.qualityScore !== undefined ? product.qualityScore : null
        ]);
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao salvar produto no Banco:', err);
        throw err;
    }
};

const getProductById = async (id) => {
    const query = 'SELECT * FROM products WHERE id = ?';
    return await db.get(query, [id]);
};

const enqueueProduct = async (queueItem) => {
    try {
        const query = `
            INSERT INTO queue (product_id, raw_message, formatted_message, status)
            VALUES (?, ?, ?, 'approved')
            ON CONFLICT (product_id) DO NOTHING
        `;
        const res = await db.run(query, [queueItem.productId, queueItem.rawMessage, queueItem.formattedMessage]);
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao enfileirar no Banco:', err);
        throw err;
    }
};

const getQueue = async (status) => {
    let query = 'SELECT q.*, p.title, p.price, p.link, p.coupon, p.old_price, p.discount_percent FROM queue q JOIN products p ON q.product_id = p.id';
    let params = [];
    if (status) {
        query += ' WHERE q.status = ?';
        params.push(status);
    }
    query += ' ORDER BY q.created_at ASC';
    return await db.all(query, params);
};

const updateQueueStatus = async (id, status) => {
    const query = 'UPDATE queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    const res = await db.run(query, [status, id]);
    return res.rowCount;
};

const getNextApprovedItem = async () => {
    try {
        const lastNiche = lastSentNiche;

        while (true) {
            // 2. Tentar pegar um produto APROVADO que seja de um nicho DIFERENTE do último enviado, ordenando por qualidade/métricas
            let query = `
                SELECT q.*, p.title, p.price, p.link, p.original_link, p.image_url, p.description, p.coupon, p.old_price, p.discount_percent, p.rating, p.reviews_count, p.quality_score
                FROM queue q 
                JOIN products p ON q.product_id = p.id 
                WHERE q.status = 'approved' 
                AND p.description != ?
                ORDER BY p.quality_score DESC NULLS LAST, p.created_at ASC
                LIMIT 1
            `;
            let item = await db.get(query, [lastNiche]);

            // 3. Fallback: Se não achar de nicho diferente, pega qualquer aprovado ordenando por qualidade/métricas
            if (!item) {
                query = `
                    SELECT q.*, p.title, p.price, p.link, p.original_link, p.image_url, p.description, p.coupon, p.old_price, p.discount_percent, p.rating, p.reviews_count, p.quality_score
                    FROM queue q 
                    JOIN products p ON q.product_id = p.id 
                    WHERE q.status = 'approved' 
                    ORDER BY p.quality_score DESC NULLS LAST, p.created_at ASC
                    LIMIT 1
                `;
                item = await db.get(query, []);
            }

            if (!item) {
                return null;
            }

            // Tentar lockar o item alterando o status de 'approved' para 'sending'
            const updateQuery = `
                UPDATE queue 
                SET status = 'sending', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND status = 'approved'
            `;
            const lockRes = await db.run(updateQuery, [item.id]);
            if (lockRes.rowCount === 0) {
                logger.warn(`[GetNextApprovedItem] Concorrência detectada: item ${item.id} já foi lockado ou modificado por outra instância. Tentando outro.`);
                continue;
            }

            // Checagem retroativa de duplicados:
            // Se o produto selecionado já foi publicado recentemente (nas últimas 24h),
            // removemos esse item duplicado da fila e continuamos o loop para pegar outro.
            const USE_POSTGRES = isPostgres();
            const timeCondition = USE_POSTGRES
                ? "p.created_at >= NOW() - INTERVAL '24 hours'"
                : "p.created_at >= datetime('now', '-24 hours')";

            const publishedProducts = await db.all(`
                SELECT p.id, p.title, p.link, p.original_link, p.image_url 
                FROM products p
                LEFT JOIN queue q ON p.id = q.product_id
                WHERE q.product_id IS NULL AND p.id != ? AND (${timeCondition} OR p.created_at IS NULL)
            `, [item.product_id]);

            const itemCleanLink = cleanLink(item.original_link || item.link);
            const itemMlbId = extractMlbId(item.original_link || item.link);
            const itemShopeeId = extractShopeeId(item.original_link || item.link) || extractShopeeId(item.product_id);
            const itemNormTitle = normalizeTitle(item.title);
 
            let isDup = false;
            for (const p of publishedProducts) {
                const pCleanLink = cleanLink(p.original_link || p.link);
                const pMlbId = extractMlbId(p.original_link || p.link);
                const pShopeeId = extractShopeeId(p.original_link || p.link) || extractShopeeId(p.id);

                if (itemMlbId && pMlbId && itemMlbId === pMlbId) {
                    isDup = true;
                    break;
                }
                if (itemShopeeId && pShopeeId && itemShopeeId === pShopeeId) {
                    isDup = true;
                    break;
                }
                if (itemCleanLink && pCleanLink && itemCleanLink === pCleanLink) {
                    isDup = true;
                    break;
                }
                if (itemNormTitle && normalizeTitle(p.title) === itemNormTitle) {
                    isDup = true;
                    break;
                }
                if (item.image_url && p.image_url) {
                    const itemImgId = extractImageId(item.image_url);
                    const pImgId = extractImageId(p.image_url);
                    if (itemImgId && pImgId) {
                        if (itemImgId === pImgId) {
                            isDup = true;
                            break;
                        }
                    } else if (p.image_url === item.image_url) {
                        isDup = true;
                        break;
                    }
                }
            }

            if (isDup) {
                logger.info(`[GetNextApprovedItem] Pulando e limpando item duplicado retroativo da fila. ID: ${item.product_id}, Título: ${item.title}`);
                await db.run('DELETE FROM queue WHERE id = ?', [item.id]);
                continue;
            }

            item.status = 'sending';
            item.niche = item.description || item.niche;
            return item;
        }
    } catch (err) {
        logger.error('Erro ao buscar próximo item da fila:', err);
        return null;
    }
};

const getNextApprovedItemByNiche = async (niche) => {
    try {
        const cleanNiche = String(niche || '').toLowerCase();
        let query = `
            SELECT q.*, p.title, p.price, p.link, p.original_link, p.image_url, p.description, p.coupon, p.old_price, p.discount_percent, p.rating, p.reviews_count, p.quality_score
            FROM queue q 
            JOIN products p ON q.product_id = p.id 
            WHERE q.status = 'approved' 
            AND (p.description = ? OR p.description LIKE ?)
            ORDER BY p.quality_score DESC NULLS LAST, p.created_at ASC
            LIMIT 1
        `;
        let item = await db.get(query, [cleanNiche, `%${cleanNiche}%`]);
        if (!item) return null;

        const updateQuery = `
            UPDATE queue 
            SET status = 'sending', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND status = 'approved'
        `;
        const lockRes = await db.run(updateQuery, [item.id]);
        if (lockRes.rowCount === 0) return null;

        item.status = 'sending';
        item.niche = cleanNiche;
        return item;
    } catch (err) {
        logger.error(`Erro ao buscar próximo item do nicho ${niche}:`, err);
        return null;
    }
};

const deleteProductAndQueueItem = async (productId, niche) => {
    try {
        if (niche) {
            lastSentNiche = niche;
        }
        // Remove apenas o item da fila de envio (queue) para marcar como publicado,
        // mas mantém o registro em 'products' para evitar que o produto seja recapturado pelo crawler.
        const res = await db.run('DELETE FROM queue WHERE product_id = ?', [productId]);
        return res.rowCount;
    } catch (err) {
        logger.error(`Erro ao deletar item da fila ${productId}:`, err);
        throw err;
    }
};

const pruneOldProducts = async () => {
    try {
        const days = env.historyPruneDays || 15;
        const USE_POSTGRES = isPostgres();
        let query;
        if (USE_POSTGRES) {
            query = `DELETE FROM products WHERE created_at < NOW() - INTERVAL '${days} days'`;
        } else {
            query = `DELETE FROM products WHERE created_at < datetime('now', '-${days} days')`;
        }
        const res = await db.run(query, []);
        if (res.rowCount > 0) {
            logger.info(`🧹 Limpeza: ${res.rowCount} produtos antigos com mais de ${days} dias foram removidos do banco.`);
        }
    } catch (err) {
        logger.warn('Erro ao limpar produtos antigos:', err.message);
    }
};

// Retorna apenas os campos mínimos necessários para pré-checagem de duplicados
const getAllProductsBasic = async () => {
    try {
        return await db.all('SELECT id, title, link, original_link, image_url FROM products');
    } catch (err) {
        logger.warn('Erro ao buscar produtos básicos:', err.message);
        return [];
    }
};

const clearQueue = async () => {
    try {
        await db.run('DELETE FROM queue', []);
        const res = await db.run('DELETE FROM products', []);
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao limpar banco:', err);
    }
};

const clearQueueOnly = async () => {
    try {
        const res = await db.run('DELETE FROM queue', []);
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao limpar apenas a fila:', err);
    }
};

const resetSendingStatus = async () => {
    try {
        const res = await db.run("UPDATE queue SET status = 'approved' WHERE status = 'sending'", []);
        if (res.rowCount > 0) {
            logger.info(`🔄 Recuperação: ${res.rowCount} itens travados em envio foram reativados na fila.`);
        }
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao resetar status de envio:', err);
        throw err;
    }
};

const resetStuckSendingItems = async () => {
    try {
        const USE_POSTGRES = isPostgres();
        let query;
        if (USE_POSTGRES) {
            query = `UPDATE queue SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '3 minutes'`;
        } else {
            query = `UPDATE queue SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE status = 'sending' AND updated_at < datetime('now', '-3 minutes')`;
        }
        const res = await db.run(query, []);
        if (res.rowCount > 0) {
            logger.info(`🔄 Recuperação automática: ${res.rowCount} itens travados em 'sending' por mais de 3 minutos foram reativados.`);
        }
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao resetar itens travados em envio:', err);
    }
};

const getSetting = async (key) => {
    try {
        const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
        return row ? row.value : null;
    } catch (e) {
        logger.debug(`[Repository] Setting ${key} not found: ${e.message}`);
        return null;
    }
};

const setSetting = async (key, value) => {
    try {
        const query = `
            INSERT INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP) 
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
        `;
        await db.run(query, [key, value]);
        return true;
    } catch (e) {
        logger.error(`[Repository] Error saving setting ${key}: ${e.message}`);
        return false;
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// GESTÃO DE CUPONS DIÁRIOS
// ──────────────────────────────────────────────────────────────────────────────

const saveCoupon = async (coupon) => {
    try {
        if (!coupon || !coupon.code) return 0;
        const code = String(coupon.code).trim().toUpperCase();
        const description = coupon.description || coupon.title || '';
        const rule = coupon.rule || coupon.discount || '';
        const category = coupon.category || null;
        const minAmount = typeof coupon.minAmount === 'number' ? coupon.minAmount : (typeof coupon.min_amount === 'number' ? coupon.min_amount : 0);
        const discountValue = coupon.discountValue !== undefined ? coupon.discountValue : (coupon.discount_value !== undefined ? coupon.discount_value : null);
        const discountType = coupon.discountType || coupon.discount_type || 'unknown';
        const isActive = coupon.isActive !== undefined ? (coupon.isActive ? 1 : 0) : 1;
        const source = coupon.source || 'scraper';

        const query = `
            INSERT INTO coupons (code, description, rule, category, min_amount, discount_value, discount_type, is_active, source, captured_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (code) DO UPDATE SET
                description = EXCLUDED.description,
                rule = EXCLUDED.rule,
                category = EXCLUDED.category,
                min_amount = EXCLUDED.min_amount,
                discount_value = EXCLUDED.discount_value,
                discount_type = EXCLUDED.discount_type,
                is_active = EXCLUDED.is_active,
                source = EXCLUDED.source,
                updated_at = CURRENT_TIMESTAMP
        `;
        const res = await db.run(query, [code, description, rule, category, minAmount, discountValue, discountType, isActive, source]);
        return res.rowCount;
    } catch (err) {
        logger.error(`[Repository] Erro ao salvar cupom ${coupon?.code}: ${err.message}`);
        return 0;
    }
};

const saveCouponsBatch = async (coupons = []) => {
    if (!Array.isArray(coupons) || coupons.length === 0) return 0;
    let saved = 0;
    for (const c of coupons) {
        const count = await saveCoupon(c);
        if (count > 0) saved++;
    }
    return saved;
};

const getActiveCoupons = async () => {
    try {
        const query = 'SELECT * FROM coupons WHERE is_active = 1 ORDER BY min_amount ASC, updated_at DESC';
        return await db.all(query, []);
    } catch (err) {
        logger.error(`[Repository] Erro ao listar cupons ativos: ${err.message}`);
        return [];
    }
};

const getCouponByCode = async (code) => {
    try {
        if (!code) return null;
        const query = 'SELECT * FROM coupons WHERE code = ?';
        return await db.get(query, [code.trim().toUpperCase()]);
    } catch (err) {
        logger.error(`[Repository] Erro ao buscar cupom ${code}: ${err.message}`);
        return null;
    }
};

const deactivateExpiredCoupons = async (maxHours = 24) => {
    try {
        const USE_POSTGRES = isPostgres();
        let query;
        if (USE_POSTGRES) {
            query = `UPDATE coupons SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1 AND updated_at < NOW() - INTERVAL '${maxHours} hours'`;
        } else {
            query = `UPDATE coupons SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1 AND updated_at < datetime('now', '-${maxHours} hours')`;
        }
        const res = await db.run(query, []);
        if (res.rowCount > 0) {
            logger.info(`🧹 Limpeza: ${res.rowCount} cupons com mais de ${maxHours}h foram desativados.`);
        }
        return res.rowCount;
    } catch (err) {
        logger.warn('Erro ao desativar cupons expirados:', err.message);
        return 0;
    }
};

const pruneOldCoupons = async (days = 7) => {
    try {
        const USE_POSTGRES = isPostgres();
        let query;
        if (USE_POSTGRES) {
            query = `DELETE FROM coupons WHERE updated_at < NOW() - INTERVAL '${days} days'`;
        } else {
            query = `DELETE FROM coupons WHERE updated_at < datetime('now', '-${days} days')`;
        }
        const res = await db.run(query, []);
        if (res.rowCount > 0) {
            logger.info(`🧹 Limpeza: ${res.rowCount} cupons antigos com mais de ${days} dias foram removidos.`);
        }
        return res.rowCount;
    } catch (err) {
        logger.warn('Erro ao limpar cupons antigos:', err.message);
        return 0;
    }
};

// 👤 Módulo de Usuários / Autenticação Administrativa 👤
const getUserByEmail = async (email) => {
    try {
        if (!email) return null;
        const clean = String(email).trim().toLowerCase();
        const row = await db.get(
            "SELECT id, email, password_hash as passwordHash, role, created_at as createdAt, updated_at as updatedAt FROM users WHERE LOWER(email) = ?",
            [clean]
        );
        return row || null;
    } catch (e) {
        logger.error("[Repository] Erro ao buscar usuário por email/username: " + e.message);
        return null;
    }
};

const saveOrUpdateUser = async (email, passwordHash, role = 'admin') => {
    try {
        const clean = String(email).trim().toLowerCase();
        const existing = await getUserByEmail(clean);
        if (existing) {
            await db.run(
                "UPDATE users SET password_hash = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [passwordHash, role, existing.id]
            );
            return await getUserByEmail(clean);
        } else {
            await db.run(
                "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
                [clean, passwordHash, role]
            );
            return await getUserByEmail(clean);
        }
    } catch (e) {
        logger.error("[Repository] Erro ao cadastrar/atualizar usuário: " + e.message);
        throw e;
    }
};

const countUsers = async () => {
    try {
        const row = await db.get("SELECT COUNT(*) as count FROM users", []);
        return row ? parseInt(row.count, 10) : 0;
    } catch (e) {
        logger.error("[Repository] Erro ao contar usuários: " + e.message);
        return 0;
    }
};

const purgeSeedProducts = async () => {
    try {
        const seedIds = ['MLB52595849', 'MLB3735233072', 'MLB500', 'MLB3455211591', 'MLB5188426815', '3'];
        for (const sId of seedIds) {
            await db.run("DELETE FROM queue WHERE product_id = ?", [sId]);
            await db.run("DELETE FROM products WHERE id = ?", [sId]);
        }
        await db.run("DELETE FROM queue WHERE product_id IN (SELECT id FROM products WHERE quality_score = 100 AND rating = 4.8 AND reviews_count = 120 AND (original_link LIKE '%meli.la/2CQRTt7%' OR original_link LIKE '%meli.la/2drHMKg%' OR original_link LIKE '%meli.la/1nUFnSV%'))", []);
        await db.run("DELETE FROM products WHERE quality_score = 100 AND rating = 4.8 AND reviews_count = 120 AND (original_link LIKE '%meli.la/2CQRTt7%' OR original_link LIKE '%meli.la/2drHMKg%' OR original_link LIKE '%meli.la/1nUFnSV%')", []);
        logger.info('🧹 Limpeza preventiva de produtos estáticos de seed concluída.');
    } catch (e) {
        logger.debug(`[Repository] Erro ao limpar produtos de seed: ${e.message}`);
    }
};

const seedInitialProductsIfEmpty = async () => {
    try {
        if (!env.enableSeedProducts) {
            logger.debug('[Seed] Importação de produtos estáticos desativada para priorizar promoções 100% reais (ENABLE_SEED_PRODUCTS = false).');
            return 0;
        }

        const approvedCountRow = await db.get("SELECT COUNT(*) as count FROM queue WHERE status = 'approved'");
        const approvedCount = approvedCountRow ? parseInt(approvedCountRow.count, 10) : 0;
        if (approvedCount > 0) {
            logger.info(`📦 Fila já possui ${approvedCount} produtos aprovados prontos para publicação.`);
            return approvedCount;
        }

        let targetSeedFile = 'initial_products.json';
        if (env && env.nicheProfile && env.nicheProfile.seedFile) {
            targetSeedFile = env.nicheProfile.seedFile;
        }
        let seedPath = path.join(__dirname, 'seeds', targetSeedFile);
        if (!fs.existsSync(seedPath)) {
            seedPath = path.join(__dirname, 'seeds', 'initial_products.json');
        }
        if (!fs.existsSync(seedPath)) {
            logger.warn(`⚠️ Arquivo de seed inicial não encontrado em ${seedPath}`);
            return 0;
        }

        const rawSeed = fs.readFileSync(seedPath, 'utf8');
        const seedItems = JSON.parse(rawSeed);
        if (!Array.isArray(seedItems) || seedItems.length === 0) return 0;

        logger.info(`🌱 Fila vazia detectada! Importando ${seedItems.length} produtos do seed inicial...`);
        let imported = 0;
        for (const item of seedItems) {
            try {
                await db.run(`
                    INSERT INTO products (id, title, price, link, original_link, image_url, description, coupon, old_price, discount_percent, rating, reviews_count, quality_score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        price = excluded.price,
                        link = excluded.link,
                        image_url = COALESCE(excluded.image_url, products.image_url),
                        coupon = COALESCE(excluded.coupon, products.coupon),
                        old_price = COALESCE(excluded.old_price, products.old_price),
                        discount_percent = COALESCE(excluded.discount_percent, products.discount_percent)
                `, [
                    item.id,
                    item.title,
                    item.price,
                    item.link,
                    item.original_link || item.link,
                    item.image_url || null,
                    item.description || null,
                    item.coupon || '',
                    item.old_price || null,
                    item.discount_percent || null,
                    item.rating || 4.8,
                    item.reviews_count || 120,
                    item.quality_score || 100
                ]);

                await db.run(`
                    INSERT INTO queue (product_id, raw_message, formatted_message, status)
                    VALUES (?, ?, ?, 'approved')
                    ON CONFLICT (product_id) DO UPDATE SET status = 'approved'
                `, [
                    item.id,
                    item.raw_message || '',
                    item.formatted_message || ''
                ]);
                imported++;
            } catch (err) {
                logger.debug(`[Seed] Item ${item.id} pulado: ${err.message}`);
            }
        }
        logger.info(`✅ Seed inicial concluído: ${imported} produtos adicionados com sucesso à fila aprovada!`);
        return imported;
    } catch (e) {
        logger.error(`❌ Erro ao executar seed inicial: ${e.message}`);
        return 0;
    }
};

// ─── MÓDULO OAUTH 2.0 MERCADO LIVRE ───────────────────────────────────────
const saveOAuthTokens = async (tokenData) => {
    if (!tokenData || !tokenData.access_token || !tokenData.refresh_token) {
        throw new Error('Tokens inválidos para salvamento');
    }
    const expiresInMs = (tokenData.expires_in || 21600) * 1000;
    const expiresAt = Date.now() + expiresInMs;
    const userId = String(tokenData.user_id || '');
    const scope = tokenData.scope || '';
    const tokenType = tokenData.token_type || 'bearer';

    const existing = await db.get("SELECT id FROM oauth_tokens WHERE id = 'ml_primary_account'");
    if (existing) {
        await db.run(
            `UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, token_type = ?, expires_at = ?, user_id = ?, scope = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'ml_primary_account'`,
            [tokenData.access_token, tokenData.refresh_token, tokenType, expiresAt, userId, scope]
        );
    } else {
        await db.run(
            `INSERT INTO oauth_tokens (id, access_token, refresh_token, token_type, expires_at, user_id, scope) VALUES ('ml_primary_account', ?, ?, ?, ?, ?, ?)`,
            [tokenData.access_token, tokenData.refresh_token, tokenType, expiresAt, userId, scope]
        );
    }
    logger.info(`[OAuth] Tokens salvos com sucesso no banco de dados. Válido por ~${Math.round(expiresInMs / 60000)} minutos.`);
};

const getOAuthTokens = async () => {
    const row = await db.get("SELECT * FROM oauth_tokens WHERE id = 'ml_primary_account'");
    if (!row) return null;
    const now = Date.now();
    const expiresAtNum = Number(row.expires_at);
    return {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        tokenType: row.token_type,
        expiresAt: expiresAtNum,
        userId: row.user_id,
        isExpired: now >= (expiresAtNum - 60000)
    };
};

const getSafeOAuthStatus = async () => {
    const tokens = await getOAuthTokens();
    if (!tokens) {
        return {
            authenticated: false,
            message: 'Nenhum token encontrado. Acesse /auth/login para autorizar.'
        };
    }
    const now = Date.now();
    const remainingMs = Math.max(0, tokens.expiresAt - now);
    return {
        authenticated: true,
        userId: tokens.userId || 'Configurado',
        tokenType: tokens.tokenType,
        expiresAt: new Date(tokens.expiresAt).toISOString(),
        minutesRemaining: Math.floor(remainingMs / 60000),
        isExpired: tokens.isExpired,
        status: tokens.isExpired ? 'Expirado (renovação necessária)' : 'Ativo e Válido'
    };
};

const clearOAuthTokens = async () => {
    await db.run("DELETE FROM oauth_tokens WHERE id = 'ml_primary_account'");
    logger.info('[OAuth] Tokens removidos do banco.');
};

module.exports = {
  saveProduct,
  getProductById,
  getAllProductsBasic,
  enqueueProduct,
  getQueue,
  updateQueueStatus,
  getNextApprovedItem,
  getNextApprovedItemByNiche,
  deleteProductAndQueueItem,
  clearQueue,
  clearQueueOnly,
  resetSendingStatus,
  resetStuckSendingItems,
  pruneOldProducts,
  getSetting,
  setSetting,
  saveCoupon,
  saveCouponsBatch,
  getActiveCoupons,
  getCouponByCode,
  deactivateExpiredCoupons,
  pruneOldCoupons,
  getUserByEmail,
  saveOrUpdateUser,
  countUsers,
  seedInitialProductsIfEmpty,
  purgeSeedProducts,
  saveOAuthTokens,
  getOAuthTokens,
  getSafeOAuthStatus,
  clearOAuthTokens
};
