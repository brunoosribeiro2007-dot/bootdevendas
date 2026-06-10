const { initializeDB, db } = require('../src/database/init');
const repository = require('../src/database/repository');
const queueService = require('../src/services/queue.service');

async function runTest() {
    try {
        console.log('Inicializando banco de dados...');
        await initializeDB();
        
        // Limpa totalmente a fila e histórico para o teste começar limpo
        console.log('Limpando fila/produtos...');
        await repository.clearQueue();

        const productA = {
            id: 'ML-TEST-A',
            title: 'Câmera IP Wifi E27',
            price: 52.99,
            link: 'https://meli.la/2nZe7vc',
            imageUrl: 'https://test.com/camera.jpg',
            description: 'Casa'
        };

        const productB = {
            id: 'ML-TEST-B', // ID diferente
            title: 'Câmera IP Wifi E27 Versão Especial',
            price: 52.99,
            link: 'https://meli.la/2nZe7vc', // Link idêntico!
            imageUrl: 'https://test.com/camera.jpg',
            description: 'Casa'
        };

        const productC = {
            id: 'ML-TEST-C', // ID diferente
            title: 'Câmera IP Wifi E27', // Título idêntico!
            price: 59.99,
            link: 'https://meli.la/other-link',
            imageUrl: 'https://test.com/camera.jpg',
            description: 'Casa'
        };

        const productD = {
            id: 'ML-TEST-D', // ID diferente
            title: 'Outro Produto Diferente', // Título diferente
            price: 99.99,
            link: 'https://meli.la/different-link', // Link diferente
            imageUrl: 'https://test.com/other.jpg',
            description: 'Casa'
        };

        console.log('\n--- 1. Inserindo Produto A (Novo) ---');
        const addedA = await queueService.addToQueue(productA, 'rawMsgA', 'formattedMsgA');
        console.log(`Produto A adicionado? ${addedA} (Esperado: true)`);

        console.log('\n--- 2. Inserindo Produto B (Duplicado por Link) ---');
        const addedB = await queueService.addToQueue(productB, 'rawMsgB', 'formattedMsgB');
        console.log(`Produto B adicionado? ${addedB} (Esperado: false)`);

        console.log('\n--- 3. Inserindo Produto C (Duplicado por Título) ---');
        const addedC = await queueService.addToQueue(productC, 'rawMsgC', 'formattedMsgC');
        console.log(`Produto C adicionado? ${addedC} (Esperado: false)`);

        console.log('\n--- 4. Inserindo Produto D (Novo, sem duplicados) ---');
        const addedD = await queueService.addToQueue(productD, 'rawMsgD', 'formattedMsgD');
        console.log(`Produto D adicionado? ${addedD} (Esperado: true)`);

        console.log('\n--- 5. Executando Limpeza da Fila (cleanupTask) ---');
        const { cleanupTask } = require('../src/jobs/cleanup.job');
        await cleanupTask();

        console.log('\n--- 6. Verificando estado após a Limpeza ---');
        const queueItems = await repository.getQueue(null);
        console.log(`Itens na Fila após limpeza: ${queueItems.length} (Esperado: 0)`);

        console.log('\n--- 7. Tentando reinserir Produto A após limpeza (deve ser bloqueado pelo histórico) ---');
        const addedA2 = await queueService.addToQueue(productA, 'rawMsgA2', 'formattedMsgA2');
        console.log(`Produto A adicionado novamente? ${addedA2} (Esperado: false)`);

        console.log('\n--- 8. Inserindo novo Produto E ---');
        const productE = {
            id: 'ML-TEST-E',
            title: 'Produto E Inédito',
            price: 79.99,
            link: 'https://meli.la/link-e',
            imageUrl: 'https://test.com/e.jpg',
            description: 'Casa'
        };
        await queueService.addToQueue(productE, 'rawMsgE', 'formattedMsgE');

        console.log('\n--- 9. Inserindo manualmente na fila um duplicado de D (que já foi limpo/publicado) ---');
        // Para simular um duplicado que já existia na fila:
        // Nós inserimos na tabela products o produto F (com mesmo link de D) e na fila o correspondente
        const productF = {
            id: 'ML-TEST-F',
            title: 'Outro Produto Diferente', // Mesmo título que D!
            price: 99.99,
            link: 'https://meli.la/different-link-f', 
            imageUrl: 'https://test.com/f.jpg',
            description: 'Casa'
        };
        // Salvamos ignorando a validação chamando a query do DB diretamente
        await db.run("INSERT INTO products (id, title, price, link, image_url, description) VALUES (?, ?, ?, ?, ?, ?)", [productF.id, productF.title, productF.price, productF.link, productF.imageUrl, productF.description]);
        await db.run("INSERT INTO queue (product_id, raw_message, formatted_message, status) VALUES (?, ?, ?, 'approved')", [productF.id, 'rawF', 'formattedF']);

        console.log('\n--- 10. Executando getNextApprovedItem (deve pular F por ter mesmo título que D, e trazer E) ---');
        const nextItem = await repository.getNextApprovedItem();
        console.log(`Próximo item retornado: ${nextItem ? nextItem.product_id : 'null'} (Esperado: ML-TEST-E)`);

        // Verifica se F foi realmente removido da fila
        const queueCheck = await db.all("SELECT id FROM queue WHERE product_id = ?", ['ML-TEST-F']);
        console.log(`Produto F ainda na fila? ${queueCheck.length > 0} (Esperado: false)`);

    } catch (err) {
        console.error('ERRO NO TESTE:', err);
    }
}

runTest();
