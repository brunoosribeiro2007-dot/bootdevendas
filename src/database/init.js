const env = require('../config/env');
const logger = require('../config/logger');

// ============================================================
// MODO AUTOMÁTICO: Neon (PostgreSQL) quando DATABASE_URL existe
//                  SQLite local quando não existe
// ============================================================

const USE_NEON = !!env.databaseUrl;
let pool = null;
let sqliteDb = null;

if (USE_NEON) {
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: env.databaseUrl,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    });
    logger.info('🐘 Modo: PostgreSQL (Neon)');
} else {
    logger.warn('⚠️  DATABASE_URL não encontrada. Usando SQLite local para desenvolvimento.');
    const Database = require('better-sqlite3');
    sqliteDb = new Database(env.dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    logger.info('🗃️  Modo: SQLite local');
}

// Adaptador unificado — mesma interface para Postgres e SQLite
const db = {
    run: async (query, params = []) => {
        try {
            if (USE_NEON) {
                let index = 1;
                const pgQuery = query.replace(/\?/g, () => `$${index++}`);
                const res = await pool.query(pgQuery, params);
                return { rowCount: res.rowCount };
            } else {
                const stmt = sqliteDb.prepare(query);
                // better-sqlite3 run can take params as multiple arguments or an array
                const result = stmt.run(...params);
                return { rowCount: result.changes };
            }
        } catch (err) {
            logger.error(`❌ Erro no Banco (${USE_NEON ? 'Neon' : 'SQLite'}): ${err.message}`, { query, params });
            throw err;
        }
    },
    get: async (query, params = []) => {
        try {
            if (USE_NEON) {
                let index = 1;
                const pgQuery = query.replace(/\?/g, () => `$${index++}`);
                const res = await pool.query(pgQuery, params);
                return res.rows[0];
            } else {
                const stmt = sqliteDb.prepare(query);
                return stmt.get(...params);
            }
        } catch (err) {
            logger.error(`❌ Erro no Banco (GET): ${err.message}`, { query, params });
            throw err;
        }
    },
    all: async (query, params = []) => {
        try {
            if (USE_NEON) {
                let index = 1;
                const pgQuery = query.replace(/\?/g, () => `$${index++}`);
                const res = await pool.query(pgQuery, params);
                return res.rows;
            } else {
                const stmt = sqliteDb.prepare(query);
                return stmt.all(...params);
            }
        } catch (err) {
            logger.error(`❌ Erro no Banco (ALL): ${err.message}`, { query, params });
            throw err;
        }
    }
};

// DDL compatível com ambos os bancos
const DDL = {
    products: `
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            price REAL NOT NULL,
            link TEXT NOT NULL,
            image_url TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    queue: USE_NEON
        ? `CREATE TABLE IF NOT EXISTS queue (
                id SERIAL PRIMARY KEY,
                product_id TEXT NOT NULL UNIQUE,
                raw_message TEXT NOT NULL,
                formatted_message TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
           )`
        : `CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT NOT NULL UNIQUE,
                raw_message TEXT NOT NULL,
                formatted_message TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
           )`,
    sessions: `
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
};

const initializeDB = async () => {
    try {
        if (USE_NEON) {
            logger.info('Conectando ao Neon (PostgreSQL)...');
            await pool.query(DDL.products);
            await pool.query(DDL.queue);
            await pool.query(DDL.sessions);
        } else {
            sqliteDb.exec(DDL.products);
            sqliteDb.exec(DDL.queue);
            sqliteDb.exec(DDL.sessions);
        }
        logger.info('✅ Banco de dados inicializado com sucesso.');
    } catch (err) {
        logger.error('❌ Erro ao inicializar banco de dados:', err.message);
        throw err;
    }
};

// Funções de sessão (para persistência do WhatsApp no Neon)
const saveSessionFile = async (id, data) => {
    try {
        if (USE_NEON) {
            const query = 'INSERT INTO sessions (id, data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP';
            await pool.query(query, [id, data]);
        } else {
            const stmt = sqliteDb.prepare('INSERT OR REPLACE INTO sessions (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
            stmt.run(id, data);
        }
    } catch (err) {
        logger.warn(`Falha ao salvar sessão ${id}:`, err.message);
    }
};

const deleteSessionFile = async (id) => {
    try {
        if (USE_NEON) {
            await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
        } else {
            sqliteDb.prepare('DELETE FROM sessions WHERE id = ?').run(id);
        }
    } catch (err) {
        logger.warn(`Falha ao deletar sessão ${id}:`, err.message);
    }
};

const getAllSessionFiles = async () => {
    try {
        if (USE_NEON) {
            const res = await pool.query('SELECT id, data FROM sessions');
            return res.rows;
        } else {
            return sqliteDb.prepare('SELECT id, data FROM sessions').all();
        }
    } catch (err) {
        logger.warn('Falha ao recuperar sessões:', err.message);
        return [];
    }
};

module.exports = { db, pool, initializeDB, saveSessionFile, deleteSessionFile, getAllSessionFiles };

