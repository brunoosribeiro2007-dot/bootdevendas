const formatter = require('../src/services/formatter.service');

async function run() {
  const mockProduct = {
    title: 'Mesa de Jantar Redonda de Madeira Maciça - 4 Lugares Norah 105cm',
    price: 1090.00,
    oldPrice: 1990.00,
    discountPercent: 45,
    isOfficialStore: true,
    isFull: true,
    link: 'https://www.mercadolivre.com.br/mesa-redonda-madeira-macica',
    description: 'A Stanley do CLT BR'
  };

  const formatted = await formatter.generateFormattedMessage(mockProduct, 'https://meli.la/test-shortlink');
  console.log('\n=== MENSAGEM FORMATADA (WHATSAPP) ===\n');
  console.log(formatted);
  console.log('\n=======================================\n');
}

run();
