const formatter = require('../src/services/formatter.service');

async function test() {
  console.log('Testing affiliate link generation twice for the same URL...');
  const itemUrl = 'https://produto.mercadolivre.com.br/MLB-4632890666-kit-10-cabides-infantil-acrilico-cristal-transparente-cava-_JM';
  
  const short1 = await formatter.formatLink(itemUrl);
  console.log('Result 1:', short1);

  const short2 = await formatter.formatLink(itemUrl);
  console.log('Result 2:', short2);
  
  console.log('Are they identical?', short1 === short2);
}

test().catch(console.error);
