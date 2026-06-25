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

const titlesAreVerySimilar = (t1, t2) => {
    const norm1 = normalizeTitle(t1);
    const norm2 = normalizeTitle(t2);
    if (!norm1 || !norm2) return false;
    
    if (norm1 === norm2) return true;
    
    const words1 = norm1.split(' ').filter(w => w.length > 1);
    const words2 = norm2.split(' ').filter(w => w.length > 1);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    const commonWords = words1.filter(w => words2.includes(w));
    const minLength = Math.min(words1.length, words2.length);
    const similarity = commonWords.length / minLength;
    
    return similarity >= 0.7;
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
            // Se o produto selecionado já foi publicado (está em products mas não está mais em queue),
            // removemos esse item duplicado da fila e continuamos o loop para pegar outro.
            const publishedProducts = await db.all(`
                SELECT p.id, p.title, p.link, p.original_link, p.image_url 
                FROM products p
                LEFT JOIN queue q ON p.id = q.product_id
                WHERE q.product_id IS NULL AND p.id != ?
            `, [item.product_id]);

            const itemMlbId = extractMlbId(item.original_link || item.link);
            const itemShopeeId = extractShopeeId(item.original_link || item.link) || extractShopeeId(item.product_id);
            const itemNormTitle = normalizeTitle(item.title);
 
            let isDup = false;
            for (const p of publishedProducts) {
                if (itemMlbId && (extractMlbId(p.original_link) === itemMlbId || extractMlbId(p.link) === itemMlbId)) {
                    isDup = true;
                    break;
                }
                if (itemShopeeId && (extractShopeeId(p.original_link) === itemShopeeId || extractShopeeId(p.link) === itemShopeeId || extractShopeeId(p.id) === itemShopeeId)) {
                    isDup = true;
                    break;
                }
                if (itemNormTitle && (normalizeTitle(p.title) === itemNormTitle || titlesAreVerySimilar(p.title, item.title))) {
                    isDup = true;
                    break;
                }
                if (item.link && (p.original_link === item.link || p.link === item.link)) {
                    isDup = true;
                    break;
                }
                if (item.original_link && (p.original_link === item.original_link || p.link === item.original_link)) {
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
            return item;
        }
    } catch (err) {
        logger.error('Erro ao buscar próximo item da fila:', err);
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
            query = `UPDATE queue SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '10 minutes'`;
        } else {
            query = `UPDATE queue SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE status = 'sending' AND updated_at < datetime('now', '-10 minutes')`;
        }
        const res = await db.run(query, []);
        if (res.rowCount > 0) {
            logger.info(`🔄 Recuperação automática: ${res.rowCount} itens travados em 'sending' por mais de 10 minutos foram reativados.`);
        }
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao resetar itens travados em envio:', err);
    }
};

module.exports = {
  saveProduct,
  getProductById,
  enqueueProduct,
  getQueue,
  updateQueueStatus,
  getNextApprovedItem,
  deleteProductAndQueueItem,
  clearQueue,
  clearQueueOnly,
  resetSendingStatus,
  resetStuckSendingItems,
  pruneOldProducts
};
