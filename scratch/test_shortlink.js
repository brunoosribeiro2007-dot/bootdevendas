const formatter = require('../src/services/formatter.service');

async function test() {
  console.log('Testando geração de link de afiliado meli.la...');
  const itemUrl = 'https://produto.mercadolivre.com.br/MLB-4632890666-kit-10-cabides-infantil-acrilico-cristal-transparente-cava-_JM';
  
  const short = await formatter.formatLink(itemUrl);
  console.log('Resultado obtido:', short);
}

test().catch(console.error);
