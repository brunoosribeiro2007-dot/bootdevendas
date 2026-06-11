const { db } = require('./init');
const logger = require('../config/logger');

let lastSentNiche = '';

const extractMlbId = (link) => {
    if (!link || typeof link !== 'string') return null;
    const match = link.match(/MLB-?(\d+)/i);
    return match ? match[1] : null;
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
        const existingProducts = await db.all("SELECT id, title, link, original_link FROM products");
        
        const normNewTitle = normalizeTitle(product.title);
        const newMlbId = extractMlbId(originalLink);
        
        for (const p of existingProducts) {
            // 1. Checagem por MLB ID
            if (newMlbId && (extractMlbId(p.original_link) === newMlbId || extractMlbId(p.link) === newMlbId)) {
                logger.info(`[SaveProduct] Produto duplicado ignorado (mesmo MLB ID no histórico). ID novo: ${product.id}, ID existente: ${p.id}`);
                return 0;
            }
            
            // 2. Checagem por título normalizado
            if (normNewTitle && normalizeTitle(p.title) === normNewTitle) {
                logger.info(`[SaveProduct] Produto duplicado ignorado (mesmo título normalizado no histórico). ID novo: ${product.id}, ID existente: ${p.id}, Título: ${product.title}`);
                return 0;
            }
            
            // 3. Checagem por links limpos (sem parâmetros de busca/query)
            if (cleanNewLink && (cleanLink(p.original_link) === cleanNewLink || cleanLink(p.link) === cleanNewLink)) {
                logger.info(`[SaveProduct] Produto duplicado ignorado (link idêntico no histórico). ID novo: ${product.id}, ID existente: ${p.id}`);
                return 0;
            }
        }

        const query = `
            INSERT INTO products (id, title, price, link, original_link, image_url, description, coupon, old_price, discount_percent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            product.discountPercent !== undefined ? product.discountPercent : null
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
            // 2. Tentar pegar um produto APROVADO que seja de um nicho DIFERENTE do último enviado
            let query = `
                SELECT q.*, p.title, p.price, p.link, p.original_link, p.image_url, p.description, p.coupon, p.old_price, p.discount_percent
                FROM queue q 
                JOIN products p ON q.product_id = p.id 
                WHERE q.status = 'approved' 
                AND p.description != ?
                ORDER BY RANDOM()
                LIMIT 1
            `;
            let item = await db.get(query, [lastNiche]);

            // 3. Fallback: Se não achar de nicho diferente, pega qualquer aprovado
            if (!item) {
                query = `
                    SELECT q.*, p.title, p.price, p.link, p.original_link, p.image_url, p.description, p.coupon, p.old_price, p.discount_percent
                    FROM queue q 
                    JOIN products p ON q.product_id = p.id 
                    WHERE q.status = 'approved' 
                    ORDER BY RANDOM()
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
                SELECT p.id, p.title, p.link, p.original_link 
                FROM products p
                LEFT JOIN queue q ON p.id = q.product_id
                WHERE q.product_id IS NULL AND p.id != ?
            `, [item.product_id]);

            const itemMlbId = extractMlbId(item.original_link || item.link);
            const itemNormTitle = normalizeTitle(item.title);

            let isDup = false;
            for (const p of publishedProducts) {
                if (itemMlbId && (extractMlbId(p.original_link) === itemMlbId || extractMlbId(p.link) === itemMlbId)) {
                    isDup = true;
                    break;
                }
                if (itemNormTitle && normalizeTitle(p.title) === itemNormTitle) {
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
        const USE_POSTGRES = !!process.env.DATABASE_URL;
        let query;
        if (USE_POSTGRES) {
            query = "DELETE FROM products WHERE created_at < NOW() - INTERVAL '3 days'";
        } else {
            query = "DELETE FROM products WHERE created_at < datetime('now', '-3 days')";
        }
        const res = await db.run(query, []);
        if (res.rowCount > 0) {
            logger.info(`🧹 Limpeza: ${res.rowCount} produtos antigos com mais de 3 dias foram removidos do banco.`);
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
  pruneOldProducts
};
