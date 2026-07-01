const repository = require('../src/database/repository');
const publisher = require('../src/publishers/whatsapp.publisher');
const captureJob = require('../src/jobs/capture.job');
const env = require('../src/config/env');

// Mock dos módulos antes de carregar o publisher.job
jest.mock('../src/database/repository');
jest.mock('../src/publishers/whatsapp.publisher');
jest.mock('../src/jobs/capture.job');

const publisherJob = require('../src/jobs/publisher.job');

describe('Publisher Job - Consistency Enhancements', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        // Garante que o horário do teste esteja sempre dentro da janela de publicação
        env.publishStartTime = '00:00';
        env.publishEndTime = '23:59';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should schedule retry in 30 seconds if WhatsApp is not ready', async () => {
        // Mock WhatsApp as NOT ready
        publisher.isReady = false;

        // Trigger publishTask
        await publisherJob.publishTask();

        // Should NOT fetch approved item because it returned early
        expect(repository.getNextApprovedItem).not.toHaveBeenCalled();

        // Simula WhatsApp conectando nesse meio tempo
        publisher.isReady = true; 
        repository.getNextApprovedItem.mockResolvedValueOnce(null); // Evita loop infinito

        // Avança o timer
        jest.advanceTimersByTime(30000);

        // Flusha as microtasks pendentes para permitir a execução da Promise do publishTask retentado
        await Promise.resolve();
        await Promise.resolve();

        // Verificamos se o publishTask executou a retentativa
        expect(repository.getNextApprovedItem).toHaveBeenCalled();
    });

    test('should trigger captureTask if queue is empty', async () => {
        // Mock WhatsApp as ready
        publisher.isReady = true;

        // Mock repository returning null (empty queue)
        repository.getNextApprovedItem.mockResolvedValue(null);

        // Trigger publishTask
        await publisherJob.publishTask();

        // Should call captureTask immediately in background
        expect(captureJob.captureTask).toHaveBeenCalled();
    });
});
