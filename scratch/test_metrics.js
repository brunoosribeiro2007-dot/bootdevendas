const { db, initializeDB } = require('../src/database/init');
const repository = require('../src/database/repository');
const queueService = require('../src/services/queue.service');

async function test() {
    console.log('🔄 Inicializando banco de dados e aplicando migrações...');
    await initializeDB();
    
    console.log('✅ Banco inicializado. Criando produtos de teste...');
    
    // Produto 1: Qualidade Média
    const prodMedio = {
        id: 'TEST-MEDIO',
        title: 'Produto de Teste Qualidade Média',
        price: 100.0,
        link: 'https://link.com/medio',
        imageUrl: 'https://image.com/medio.jpg',
        description: 'Teste Niche A',
        rating: 4.6,
        reviewsCount: 150,
        qualityScore: 180.0 // (4.6 * 25) + (150 / 50) + 30 + 15 = 115 + 3 + 30 + 15 = 163 (aproximado)
    };

    // Produto 2: Alta Qualidade (Marca famosa, super bem avaliado)
    const prodPremium = {
        id: 'TEST-PREMIUM',
        title: 'Produto de Teste Premium Super Relevante',
        price: 250.0,
        link: 'https://link.com/premium',
        imageUrl: 'https://image.com/premium.jpg',
        description: 'Teste Niche B',
        rating: 4.9,
        reviewsCount: 2500,
        qualityScore: 250.0 // (4.9 * 25) + (2500 / 50) + 50 + 30 + 20 = 122.5 + 50 + 50 + 30 + 20 = 272.5
    };
    
    try {
        // Limpa possíveis resíduos anteriores
        await db.run("DELETE FROM queue WHERE product_id IN ('TEST-MEDIO', 'TEST-PREMIUM')");
        await db.run("DELETE FROM products WHERE id IN ('TEST-MEDIO', 'TEST-PREMIUM')");
        
        console.log('📥 Salvando e enfileirando Produto Médio...');
        await queueService.addToQueue(prodMedio, 'raw_medio', 'formatted_medio');
        
        console.log('📥 Salvando e enfileirando Produto Premium...');
        await queueService.addToQueue(prodPremium, 'raw_premium', 'formatted_premium');
        
        console.log('\n🔍 Consultando tabela products...');
        const storedProducts = await db.all("SELECT id, title, rating, reviews_count, quality_score FROM products WHERE id IN ('TEST-MEDIO', 'TEST-PREMIUM')");
        console.table(storedProducts);
        
        console.log('\n📤 Buscando o próximo item da fila (deve ser o PREMIUM por conta da ordenação por métricas)...');
        const nextItem = await repository.getNextApprovedItem();
        if (nextItem) {
            console.log(`Próximo item retornado: ${nextItem.product_id} - ${nextItem.title}`);
            console.log(`Métricas - Nota: ${nextItem.rating}, Reviews: ${nextItem.reviews_count}, Score: ${nextItem.quality_score}`);
            
            if (nextItem.product_id === 'TEST-PREMIUM') {
                console.log('🎉 SUCESSO! O item Premium (melhor métrica) foi selecionado primeiro, provando que a ordenação por métricas está funcionando.');
            } else {
                console.log('❌ ERRO! O item Premium não foi selecionado primeiro.');
            }
        } else {
            console.log('❌ ERRO! Fila de aprovados vazia.');
        }
        
        // Limpeza dos dados de teste
        console.log('\n🧹 Limpando dados de teste...');
        await db.run("DELETE FROM queue WHERE product_id IN ('TEST-MEDIO', 'TEST-PREMIUM')");
        await db.run("DELETE FROM products WHERE id IN ('TEST-MEDIO', 'TEST-PREMIUM')");
        console.log('✅ Limpeza concluída.');
        
    } catch (err) {
        console.error('❌ Erro no teste:', err);
    }
    
    process.exit(0);
}

test();
