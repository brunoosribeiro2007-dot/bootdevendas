const { captureTask } = require('../src/jobs/capture.job');

async function testJob() {
    console.log('--- SIMULAÇÃO DE EXECUÇÃO DO JOB DE CAPTURA ---');
    try {
        await captureTask();
        console.log('--- FIM DA SIMULAÇÃO ---');
    } catch (e) {
        console.error('Erro na simulação do job:', e);
    }
    process.exit(0);
}

testJob();
