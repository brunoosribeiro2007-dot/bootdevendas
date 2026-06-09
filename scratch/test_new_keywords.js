const mlService = require('../src/services/mercadoLivre.service');
const logger = require('../src/config/logger');

// Set level to debug to see filtering logs
logger.level = 'debug';

async function run() {
  try {
    console.log("--- TESTANDO BUSCA DE GUARDA-ROUPA ---");
    const productsGuardaRoupa = await mlService.searchProducts('Guarda-roupa');
    console.log(`Guarda-roupa: Encontrou ${productsGuardaRoupa.length} produtos.`);
    if (productsGuardaRoupa.length > 0) {
      console.log("Exemplo de produto:", productsGuardaRoupa[0].title, "Preço:", productsGuardaRoupa[0].price);
    }

    console.log("\n--- TESTANDO BUSCA DE CAIXA DE FERRAMENTAS ---");
    const productsFerramentas = await mlService.searchProducts('Caixa de ferramentas');
    console.log(`Caixa de ferramentas: Encontrou ${productsFerramentas.length} produtos.`);
    if (productsFerramentas.length > 0) {
      console.log("Exemplo de produto:", productsFerramentas[0].title, "Preço:", productsFerramentas[0].price);
    }
  } catch (e) {
    console.error("Erro no teste:", e.message);
  }
}
run();
