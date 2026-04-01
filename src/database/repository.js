const { db } = require('./init');
const logger = require('../config/logger');

const saveProduct = (product) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO products (id, title, price, link, image_url, description)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `;
    db.run(query, [product.id, product.title, product.price, product.link, product.imageUrl, product.description], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const getProductById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const enqueueProduct = (queueItem) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO queue (product_id, raw_message, formatted_message, status)
      VALUES (?, ?, ?, 'approved')
      ON CONFLICT(product_id) DO NOTHING
    `;
    db.run(query, [queueItem.productId, queueItem.rawMessage, queueItem.formattedMessage], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const getQueue = (status) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT q.*, p.title, p.price, p.link FROM queue q JOIN products p ON q.product_id = p.id';
    let params = [];
    if (status) {
      query += ' WHERE q.status = ?';
      params.push(status);
    }
    query += ' ORDER BY q.created_at ASC';
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const updateQueueStatus = (id, status) => {
  return new Promise((resolve, reject) => {
    const query = 'UPDATE queue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(query, [status, id], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const getNextApprovedItem = () => {
    return new Promise((resolve, reject) => {
        const query = "SELECT q.*, p.image_url FROM queue q JOIN products p ON q.product_id = p.id WHERE q.status = 'approved' ORDER BY q.updated_at ASC LIMIT 1";
        db.get(query, [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

const clearQueue = () => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM queue', [], function(err) {
      if (err) reject(err);
      else {
        // Opcional: Limpar também produtos antigos para não acumular lixo
        db.run('DELETE FROM products', [], (err2) => {
            if (err2) logger.warn('Falha ao limpar tabela de produtos:', err2);
            resolve(this.changes);
        });
      }
    });
  });
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
