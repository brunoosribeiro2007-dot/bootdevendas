const { searchProducts } = require('./src/services/mercadoLivre.service');
const logger = require('./src/config/logger');

async function test() {
    console.log('--- TESTE DE BUSCA ---');
    try {
        const keyword = 'Xiaomi';
        console.log(`Buscando por: ${keyword}`);
        const products = await searchProducts(keyword);
        console.log(`Total de produtos encontrados: ${products.length}`);
        
        if (products.length > 0) {
            console.log('Primeiro produto encontrado:');
            console.log(JSON.stringify(products[0], null, 2));
        } else {
            console.log('Nenhum produto encontrado em nenhum dos métodos.');
        }
    } catch (error) {
        console.error('Erro durante o teste:', error);
    }
    console.log('--- TESTE FINALIZADO ---');
}

test();
