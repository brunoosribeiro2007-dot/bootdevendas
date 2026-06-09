const mlService = require('../src/services/mercadoLivre.service');
const logger = require('../src/config/logger');

// Set level to debug to see filtering logs
logger.level = 'debug';

async function run() {
  try {
    console.log("--- TESTANDO BUSCA DE GUARDA-ROUPA ---");
    const productsGuardaRoupa = await mlService.searchProducts('Guarda-roupa');
    console.log(`Guarda-roupa: Encontrou ${productsGuardaRoupa.length} produtos.`);
    
    // Log details of up to 3 products
    productsGuardaRoupa.slice(0, 3).forEach((p, idx) => {
      console.log(`Produto #${idx + 1}:`, p.title);
      console.log(`  Preço: R$ ${p.price} | Preço Antigo: R$ ${p.oldPrice}`);
      console.log(`  Avaliação (Scraped/API): ${p.rating || 'N/A'}`);
      console.log(`  Mapeado para categoria: ${mlService.getCategoryForKeyword(p.title)}`);
    });

    console.log("\n--- TESTANDO BUSCA DE CAIXA DE FERRAMENTAS ---");
    const productsFerramentas = await mlService.searchProducts('Caixa de ferramentas');
    console.log(`Caixa de ferramentas: Encontrou ${productsFerramentas.length} produtos.`);
    
    productsFerramentas.slice(0, 3).forEach((p, idx) => {
      console.log(`Produto #${idx + 1}:`, p.title);
      console.log(`  Preço: R$ ${p.price} | Preço Antigo: R$ ${p.oldPrice}`);
      console.log(`  Avaliação (Scraped/API): ${p.rating || 'N/A'}`);
    });
  } catch (e) {
    console.error("Erro no teste:", e.message);
  }
}
run();
