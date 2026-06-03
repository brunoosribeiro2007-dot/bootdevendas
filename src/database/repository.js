const { db } = require('./init');
const logger = require('../config/logger');

// Salva Produto com Bypass de Conflito (Postgres style)
const saveProduct = async (product) => {
    try {
        const query = `
            INSERT INTO products (id, title, price, link, image_url, description, coupon)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO NOTHING
        `;
        const res = await db.run(query, [product.id, product.title, product.price, product.link, product.imageUrl, product.description, product.coupon || '']);
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
    let query = 'SELECT q.*, p.title, p.price, p.link, p.coupon FROM queue q JOIN products p ON q.product_id = p.id';
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
        // 1. Descobrir qual o nicho do último item postado (para evitar repetição de nicho)
        const lastSentQuery = `
            SELECT p.description FROM queue q 
            JOIN products p ON q.product_id = p.id 
            WHERE q.status = 'published' 
            ORDER BY q.updated_at DESC LIMIT 1
        `;
        const lastSent = await db.get(lastSentQuery, []);
        const lastNiche = lastSent ? lastSent.description : '';

        // 2. Tentar pegar um produto APROVADO que seja de um nicho DIFERENTE do último enviado
        let query = `
            SELECT q.*, p.title, p.image_url, p.description, p.coupon 
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
                SELECT q.*, p.title, p.image_url, p.description, p.coupon 
                FROM queue q 
                JOIN products p ON q.product_id = p.id 
                WHERE q.status = 'approved' 
                ORDER BY RANDOM()
                LIMIT 1
            `;
            item = await db.get(query, []);
        }

        return item;
    } catch (err) {
        logger.error('Erro ao buscar próximo item da fila:', err);
        return null;
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


module.exports = {
  saveProduct,
  getProductById,
  enqueueProduct,
  getQueue,
  updateQueueStatus,
  getNextApprovedItem,
  clearQueue
};
