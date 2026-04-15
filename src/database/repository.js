const { db } = require('./init');
const logger = require('../config/logger');

// Salva Produto com Bypass de Conflito (Postgres style)
const saveProduct = async (product) => {
    try {
        const query = `
            INSERT INTO products (id, title, price, link, image_url, description)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO NOTHING
        `;
        const res = await db.run(query, [product.id, product.title, product.price, product.link, product.imageUrl, product.description]);
        return res.rowCount;
    } catch (err) {
        logger.error('Erro ao salvar produto no Neon:', err);
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
        logger.error('Erro ao enfileirar no Neon:', err);
        throw err;
    }
};

const getQueue = async (status) => {
    let query = 'SELECT q.*, p.title, p.price, p.link FROM queue q JOIN products p ON q.product_id = p.id';
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
    const query = "SELECT q.*, p.image_url FROM queue q JOIN products p ON q.product_id = p.id WHERE q.status = 'approved' ORDER BY q.updated_at ASC LIMIT 1";
    return await db.get(query, []);
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
