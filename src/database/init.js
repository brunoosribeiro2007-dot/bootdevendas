const sqlite3 = require('sqlite3').verbose();
const env = require('../config/env');
const logger = require('../config/logger');

const db = new sqlite3.Database(env.dbPath, (err) => {
  if (err) {
    logger.error('Erro ao conectar ao banco de dados SQLite', err.message);
  } else {
    logger.info('Conectado ao banco de dados SQLite.');
  }
});

const initializeDB = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          price REAL NOT NULL,
          link TEXT NOT NULL,
          image_url TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT NOT NULL,
          raw_message TEXT NOT NULL,
          formatted_message TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'published')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(product_id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = { db, initializeDB };
