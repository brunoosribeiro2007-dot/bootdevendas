const mlService = require('../src/services/mercadoLivre.service');

async function testSearch() {
  console.log('Testando busca de produtos de casa...');
  try {
    const products = await mlService.searchProducts('potes organizadores');
    console.log('Resultados encontrados:', products.length);
    if (products.length > 0) {
      console.log('Primeiro produto:', {
        title: products[0].title,
        price: products[0].price,
        link: products[0].link
      });
    }
  } catch (err) {
    console.error('Erro no teste de busca:', err.message);
  }
}

testSearch();
