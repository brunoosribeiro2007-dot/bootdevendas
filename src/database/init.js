const env = require('../config/env');
const logger = require('../config/logger');

// ============================================================
// MODO AUTOMÁTICO: Supabase (PostgreSQL) quando DATABASE_URL existe
//                  SQLite local quando não existe ou em fallback
// ============================================================

let USE_POSTGRES = !!env.databaseUrl;
let pool = null;
let sqliteDb = null;
let sqliteDdlExecuted = false;

const initSqlite = () => {
    if (!sqliteDb) {
        const Database = require('better-sqlite3');
        sqliteDb = new Database(env.dbPath, { timeout: 10000 });
        sqliteDb.pragma('journal_mode = WAL');
        logger.info('🗃️  Modo: SQLite local (com busy_timeout de 10s)');
    }
    return sqliteDb;
};

const getSqliteDb = () => {
    if (!sqliteDb) {
        initSqlite();
    }
    return sqliteDb;
};

if (USE_POSTGRES) {
    const { Pool } = require('pg');
    pool = new Pool({
        connectionString: env.databaseUrl,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000
    });
    // Trata erros de conexão assíncronos no pool para não encerrar o processo
    pool.on('error', (err) => {
        logger.warn(`⚠️ Erro no Pool Postgres (${err.message}). Chaveando para SQLite local.`);
        USE_POSTGRES = false;
        initSqlite();
    });
    logger.info('🐘 Modo: PostgreSQL (Supabase)');
} else {
    logger.warn('⚠️  DATABASE_URL não encontrada. Usando SQLite local para desenvolvimento.');
    initSqlite();
}

// Adaptador unificado — mesma interface para Postgres e SQLite
const db = {
    run: async (query, params = []) => {
        try {
            if (USE_POSTGRES) {
                try {
                    let index = 1;
                    const pgQuery = query.replace(/\?/g, () => `$${index++}`);
                    const res = await pool.query(pgQuery, params);
                    return { rowCount: res.rowCount };
                } catch (pgErr) {
                    if (pgErr.code === 'XX000' || pgErr.code === 'ECONNREFUSED' || pgErr.message?.includes('ENOTFOUND') || pgErr.message?.includes('not found')) {
                        logger.warn(`⚠️ Supabase indisponível (${pgErr.message}). Chaveando permanentemente para SQLite local.`);
                        USE_POSTGRES = false;
                        initSqlite();
                        runSqliteDDL();
                        const stmt = getSqliteDb().prepare(query);
                        const result = stmt.run(params);
                        return { rowCount: result.changes };
                    }
                    throw pgErr;
                }
            } else {
                ensureSqliteDDL();
                const stmt = getSqliteDb().prepare(query);
                const result = stmt.run(params); 
                return { rowCount: result.changes };
            }
        } catch (err) {
            logger.error(`❌ Erro no Banco (${USE_POSTGRES ? 'Supabase' : 'SQLite'}): ${err.message}`, { query });
            throw err;
        }
    },
    get: async (query, params = []) => {
        try {
            if (USE_POSTGRES) {
                try {
                    let index = 1;
                    const pgQuery = query.replace(/\?/g, () => `$${index++}`);
                    const res = await pool.query(pgQuery, params);
                    return res.rows[0];
                } catch (pgErr) {
                    if (pgErr.code === 'XX000' || pgErr.code === 'ECONNREFUSED' || pgErr.message?.includes('ENOTFOUND') || pgErr.message?.includes('not found')) {
                        logger.warn(`⚠️ Supabase indisponível (${pgErr.message}). Chaveando permanentemente para SQLite local.`);
                        USE_POSTGRES = false;
                        initSqlite();
                        runSqliteDDL();
                        const stmt = getSqliteDb().prepare(query);
                        return stmt.get(params);
                    }
                    throw pgErr;
                }
            } else {
                ensureSqliteDDL();
                const stmt = getSqliteDb().prepare(query);
                return stmt.get(params);
            }
        } catch (err) {
            logger.error(`❌ Erro no Banco (GET): ${err.message}`, { query, params });
            throw err;
        }
    },
    all: async (query, params = []) => {
        try {
            if (USE_POSTGRES) {
                try {
                    let index = 1;
                    const pgQuery = query.replace(/\?/g, () => `$${index++}`);
                    const res = await pool.query(pgQuery, params);
                    return res.rows;
                } catch (pgErr) {
                    if (pgErr.code === 'XX000' || pgErr.code === 'ECONNREFUSED' || pgErr.message?.includes('ENOTFOUND') || pgErr.message?.includes('not found')) {
                        logger.warn(`⚠️ Supabase indisponível (${pgErr.message}). Chaveando permanentemente para SQLite local.`);
                        USE_POSTGRES = false;
                        initSqlite();
                        runSqliteDDL();
                        const stmt = getSqliteDb().prepare(query);
                        return stmt.all(params);
                    }
                    throw pgErr;
                }
            } else {
                ensureSqliteDDL();
                const stmt = getSqliteDb().prepare(query);
                return stmt.all(params);
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
            original_link TEXT,
            image_url TEXT,
            description TEXT,
            coupon TEXT,
            old_price REAL,
            discount_percent INTEGER,
            rating REAL,
            reviews_count INTEGER,
            quality_score REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    queue: `CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT NOT NULL UNIQUE,
                raw_message TEXT NOT NULL,
                formatted_message TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
           )`,
    queuePostgres: `CREATE TABLE IF NOT EXISTS queue (
                id SERIAL PRIMARY KEY,
                product_id TEXT NOT NULL UNIQUE,
                raw_message TEXT NOT NULL,
                formatted_message TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
           )`,
    sessions: `
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            data BLOB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    sessionsPostgres: `
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            data BYTEA NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    settings: `
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    coupons: `
        CREATE TABLE IF NOT EXISTS coupons (
            code TEXT PRIMARY KEY,
            description TEXT,
            rule TEXT,
            category TEXT,
            min_amount REAL DEFAULT 0,
            discount_value REAL,
            discount_type TEXT,
            is_active INTEGER DEFAULT 1,
            source TEXT,
            captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    users: `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    usersPostgres: `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    oauthTokens: `
        CREATE TABLE IF NOT EXISTS oauth_tokens (
            id TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            token_type TEXT DEFAULT 'bearer',
            expires_at BIGINT NOT NULL,
            user_id TEXT,
            scope TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
};

const runSqliteDDL = () => {
    const sDb = getSqliteDb();
    sDb.exec(DDL.products);
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN original_link TEXT');
        logger.info('🗃️ SQLite: Coluna "original_link" adicionada à tabela products.');
    } catch (e) {}
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN coupon TEXT');
        logger.info('🗃️ SQLite: Coluna "coupon" adicionada à tabela products.');
    } catch (e) {}
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN old_price REAL');
        logger.info('🗃️ SQLite: Coluna "old_price" adicionada à tabela products.');
    } catch (e) {}
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN discount_percent INTEGER');
        logger.info('🗃️ SQLite: Coluna "discount_percent" adicionada à tabela products.');
    } catch (e) {}
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN rating REAL');
        logger.info('🗃️ SQLite: Coluna "rating" adicionada à tabela products.');
    } catch (e) {}
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN reviews_count INTEGER');
        logger.info('🗃️ SQLite: Coluna "reviews_count" adicionada à tabela products.');
    } catch (e) {}
    try {
        sDb.exec('ALTER TABLE products ADD COLUMN quality_score REAL');
        logger.info('🗃️ SQLite: Coluna "quality_score" adicionada à tabela products.');
    } catch (e) {}
    sDb.exec(DDL.queue);
    try {
        const schema = sDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'queue'").get();
        if (schema && schema.sql && schema.sql.includes('CHECK')) {
            logger.info('🗃️ SQLite: Detectada restrição CHECK antiga na tabela "queue". Iniciando migração...');
            sDb.exec('ALTER TABLE queue RENAME TO queue_old');
            sDb.exec(DDL.queue);
            sDb.exec(`
                INSERT INTO queue (id, product_id, raw_message, formatted_message, status, created_at, updated_at)
                SELECT id, product_id, raw_message, formatted_message, status, created_at, updated_at FROM queue_old
            `);
            sDb.exec('DROP TABLE queue_old');
            logger.info('🗃️ SQLite: Migração da tabela "queue" concluída com sucesso (restrição CHECK removida).');
        }
    } catch (migErr) {
        logger.error('🗃️ SQLite: Erro ao migrar tabela "queue": ' + migErr.message);
    }
    sDb.exec(DDL.sessions);
    sDb.exec(DDL.settings);
    sDb.exec(DDL.coupons);
    sDb.exec(DDL.users);
    sDb.exec(DDL.oauthTokens);
    try {
        sDb.exec('CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active)');
    } catch (e) {}
    try {
        sDb.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    } catch (e) {}
};

const ensureSqliteDDL = () => {
    if (!sqliteDdlExecuted) {
        sqliteDdlExecuted = true;
        runSqliteDDL();
    }
};

const initializeDB = async () => {
    try {
        if (USE_POSTGRES) {
            try {
                logger.info('Conectando ao Supabase (PostgreSQL)...');
                await pool.query('SELECT 1');
                
                await pool.query(DDL.products);
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN original_link TEXT');
                    logger.info('🐘 Postgres: Coluna "original_link" adicionada à tabela products.');
                } catch (e) {}
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN coupon TEXT');
                    logger.info('🐘 Postgres: Coluna "coupon" adicionada à tabela products.');
                } catch (e) {}
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN old_price REAL');
                    logger.info('🐘 Postgres: Coluna "old_price" adicionada à tabela products.');
                } catch (e) {}
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN discount_percent INTEGER');
                    logger.info('🐘 Postgres: Coluna "discount_percent" adicionada à tabela products.');
                } catch (e) {}
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN rating REAL');
                    logger.info('🐘 Postgres: Coluna "rating" adicionada à tabela products.');
                } catch (e) {}
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN reviews_count INTEGER');
                    logger.info('🐘 Postgres: Coluna "reviews_count" adicionada à tabela products.');
                } catch (e) {}
                try {
                    await pool.query('ALTER TABLE products ADD COLUMN quality_score REAL');
                    logger.info('🐘 Postgres: Coluna "quality_score" adicionada à tabela products.');
                } catch (e) {}
                await pool.query(DDL.queuePostgres);
                await pool.query(DDL.sessionsPostgres);
                await pool.query(DDL.settings);
                await pool.query(DDL.coupons);
                await pool.query(DDL.usersPostgres);
                await pool.query(DDL.oauthTokens);
                try {
                    await pool.query('CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active)');
                } catch (e) {}
                try {
                    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
                } catch (e) {}
            } catch (pgErr) {
                logger.error(`❌ Erro ao conectar/inicializar Postgres (${pgErr.message}). Fazendo fallback para SQLite local...`);
                USE_POSTGRES = false;
                initSqlite();
                runSqliteDDL();
            }
        } else {
            runSqliteDDL();
        }
        logger.info('✅ Banco de dados inicializado com sucesso.');
    } catch (err) {
        logger.error('❌ Erro ao inicializar banco de dados:', err.message);
        throw err;
    }
};

const saveSessionFile = async (id, data) => {
    try {
        if (USE_POSTGRES) {
            const query = 'INSERT INTO sessions (id, data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP';
            await pool.query(query, [id, data]);
        } else {
            const stmt = getSqliteDb().prepare('INSERT OR REPLACE INTO sessions (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
            stmt.run(id, data);
        }
    } catch (err) {
        logger.warn(`Falha ao salvar sessão ${id}:`, err.message);
    }
};

const deleteSessionFile = async (id) => {
    try {
        if (USE_POSTGRES) {
            await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
        } else {
            getSqliteDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
        }
    } catch (err) {
        logger.warn(`Falha ao deletar sessão ${id}:`, err.message);
    }
};

const getAllSessionFiles = async () => {
    try {
        if (USE_POSTGRES) {
            const res = await pool.query('SELECT id, data FROM sessions');
            return res.rows;
        } else {
            return getSqliteDb().prepare('SELECT id, data FROM sessions').all();
        }
    } catch (err) {
        logger.warn('Falha ao recuperar sessões:', err.message);
        return [];
    }
};

module.exports = { db, pool, initializeDB, saveSessionFile, deleteSessionFile, getAllSessionFiles, isPostgres: () => USE_POSTGRES };
