const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../config/logger');

// Configuração do Banco Neon (Postgres)
const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5, // Limite para o plano free do Neon
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Adaptador para manter compatibilidade com as queries antigas (SQLite style)
const db = {
  run: (query, params = []) => {
      // Converte ? em $1, $2, etc (SQLite -> Postgres)
      let index = 1;
      const pgQuery = query.replace(/\?/g, () => `$${index++}`);
      return pool.query(pgQuery, params);
  },
  get: async (query, params = []) => {
      let index = 1;
      const pgQuery = query.replace(/\?/g, () => `$${index++}`);
      const res = await pool.query(pgQuery, params);
      return res.rows[0];
  },
  all: async (query, params = []) => {
      let index = 1;
      const pgQuery = query.replace(/\?/g, () => `$${index++}`);
      const res = await pool.query(pgQuery, params);
      return res.rows;
  }
};

const initializeDB = async () => {
    logger.info('Iniciando conexão com Neon (PostgreSQL)...');
    try {
        // Tabela de Produtos (Ajustada para Postgres)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                price FLOAT NOT NULL,
                link TEXT NOT NULL,
                image_url TEXT,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Fila (Ajustada para Postgres)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS queue (
                id SERIAL PRIMARY KEY,
                product_id TEXT NOT NULL UNIQUE,
                raw_message TEXT NOT NULL,
                formatted_message TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);

        // 📱 TABELA DE SESSÃO (A CHAVE DO SUCESSO!)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        logger.info('✅ Banco Neon.tech Inicializado com Sucesso.');
    } catch (err) {
        logger.error('❌ Erro Crítico ao conectar no Neon:', err.message);
        throw err;
    }
};

// Funções para Salvar/Recuperar a Sessão do WhastApp (Chave do robô inteligente)
const saveSessionFile = async (id, data) => {
    try {
        const query = 'INSERT INTO sessions (id, data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP';
        await db.run(query, [id, data]);
    } catch (err) {
        logger.warn(`Falha ao salvar arquivo de sessão ${id} no Neon:`, err.message);
    }
};

const getAllSessionFiles = async () => {
    try {
        const query = 'SELECT id, data FROM sessions';
        return await db.all(query);
    } catch (err) {
        logger.warn('Falha ao recuperar arquivos de sessão do Neon:', err.message);
        return [];
    }
};

module.exports = { db, pool, initializeDB, saveSessionFile, getAllSessionFiles };
