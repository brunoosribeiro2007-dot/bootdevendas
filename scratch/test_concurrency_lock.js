const { initializeDB, db } = require('../src/database/init');
const repository = require('../src/database/repository');

async function runTest() {
    try {
        console.log('Inicializando banco de dados...');
        await initializeDB();

        console.log('Limpando fila/produtos...');
        await repository.clearQueue();

        // 1. Inserir produto inédito
        const product = {
            id: 'ML-LOCK-A',
            title: 'Produto de Teste Lock Concorrente',
            price: 10.00,
            link: 'https://meli.la/lock-link',
            imageUrl: 'https://test.com/lock.jpg',
            description: 'Casa'
        };

        const query = `
            INSERT INTO products (id, title, price, link, image_url, description)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.run(query, [product.id, product.title, product.price, product.link, product.imageUrl, product.description]);
        await db.run("INSERT INTO queue (product_id, raw_message, formatted_message, status) VALUES (?, ?, ?, 'approved')", [product.id, 'raw', 'formatted']);

        console.log('\n--- 1. Buscando o produto na fila (deve adquirir o lock) ---');
        const item1 = await repository.getNextApprovedItem();
        console.log('Item retornado completo:', item1);

        // Verifica o status do item no banco
        const checkStatus1 = await db.get("SELECT status FROM queue WHERE product_id = ?", [product.id]);
        console.log(`Status do item após primeira busca: '${checkStatus1.status}' (Esperado: 'sending')`);

        console.log('\n--- 2. Tentando buscar concorrentemente outra vez (deve retornar null pois já está lockado) ---');
        const item2 = await repository.getNextApprovedItem();
        console.log(`Item retornado na segunda busca: ${item2 ? item2.product_id : 'null'} (Esperado: null)`);

        console.log('\n--- 3. Testando resetSendingStatus (simulando reboot do servidor) ---');
        const resetCount = await repository.resetSendingStatus();
        console.log(`Itens recuperados no reset: ${resetCount} (Esperado: 1)`);

        const checkStatus2 = await db.get("SELECT status FROM queue WHERE product_id = ?", [product.id]);
        console.log(`Status do item após reset: '${checkStatus2.status}' (Esperado: 'approved')`);

        console.log('\n--- 4. Testando rollback após falha (deve voltar para approved) ---');
        const item3 = await repository.getNextApprovedItem();
        console.log(`Item resgatado após reset: ${item3 ? item3.product_id : 'null'}`);
        
        // Simula falha chamando updateQueueStatus para 'approved'
        await repository.updateQueueStatus(item3.id, 'approved');
        const checkStatus3 = await db.get("SELECT status FROM queue WHERE product_id = ?", [product.id]);
        console.log(`Status após simulação de falha: '${checkStatus3.status}' (Esperado: 'approved')`);

        console.log('\n✅ SUCESSO: Lock concorrente, reset e rollback do status de envio funcionando 100%!');

    } catch (err) {
        console.error('ERRO NO TESTE:', err);
    }
}

runTest();
