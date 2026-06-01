const { captureTask } = require('../src/jobs/capture.job');

(async () => {
  try {
    console.log("🚀 Iniciando captura forçada de ofertas...");
    await captureTask();
    console.log("✅ Captura concluída com sucesso!");
    process.exit(0);
  } catch (e) {
    console.error("Erro na captura:", e.message);
    process.exit(1);
  }
})();
