const { initializeDB } = require('../src/database/init');
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

    } catch (err) {
        console.error('ERRO NO TESTE:', err);
    }
}

runTest();
