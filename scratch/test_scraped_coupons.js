const mlService = require('../src/services/mercadoLivre.service');
const formatterService = require('../src/services/formatter.service');

async function run() {
  console.log('🔎 Buscando ofertas do dia para verificar cupons raspados...');
  try {
    const products = await mlService.searchDailyDeals();
    console.log(`📦 Busca retornou ${products.length} produtos.`);
    
    const productsWithCoupons = products.filter(p => p.coupon);
    console.log(`🎟️ Encontrados ${productsWithCoupons.length} produtos contendo cupons na busca.`);
    
    if (productsWithCoupons.length === 0) {
      console.log('⚠️ Nenhum produto com cupom foi retornado hoje. Criando um produto mock para testar a formatação...');
      const mockProduct = {
        title: 'Jogo de Panelas Antiaderente 5 Peças',
        price: 150.00,
        description: 'Oferta: Cozinha',
        coupon: 'Cupom R$ 20 OFF',
        link: 'https://produto.mercadolivre.com.br/MLB-123456789'
      };
      
      const msg = await formatterService.generateFormattedMessage(mockProduct, 'https://meli.la/abc');
      console.log('\n--- Mensagem Formatada (Mock com Cupom): ---');
      console.log(msg);
    } else {
      console.log('✅ Utilizando um produto real raspado do Mercado Livre:');
      const realProduct = productsWithCoupons[0];
      console.log('Produto:', {
        title: realProduct.title,
        price: realProduct.price,
        coupon: realProduct.coupon,
        link: realProduct.link
      });
      
      const msg = await formatterService.generateFormattedMessage(realProduct, 'https://meli.la/abc');
      console.log('\n--- Mensagem Formatada (Real com Cupom): ---');
      console.log(msg);
    }
  } catch (err) {
    console.error('❌ Erro na execução do teste:', err.stack || err);
  }
}

run();
