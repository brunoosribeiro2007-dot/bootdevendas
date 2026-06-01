const repository = require('../src/database/repository');

(async () => {
  try {
    await repository.clearQueue();
    console.log("✅ Banco de dados e fila de ofertas limpos com sucesso!");
    process.exit(0);
  } catch (e) {
    console.error("Erro ao limpar banco:", e.message);
    process.exit(1);
  }
})();
