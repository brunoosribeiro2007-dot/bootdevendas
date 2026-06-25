const { initializeDB, pool, isPostgres } = require('../src/database/init');

async function run() {
    console.log('Connecting to database...');
    await initializeDB();
    
    if (!isPostgres()) {
        console.log('Not using PostgreSQL (Supabase). Skipping RLS activation.');
        process.exit(0);
    }
    
    console.log('\nEnabling Row Level Security (RLS) on Supabase tables...');
    try {
        await pool.query('ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;');
        console.log('✅ RLS enabled for public.products');
        
        await pool.query('ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;');
        console.log('✅ RLS enabled for public.queue');
        
        await pool.query('ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;');
        console.log('✅ RLS enabled for public.sessions');
        
        console.log('\nAll RLS security warnings successfully resolved!');
    } catch (err) {
        console.error('Error enabling RLS:', err);
    }
    
    process.exit(0);
}

run().catch(console.error);
