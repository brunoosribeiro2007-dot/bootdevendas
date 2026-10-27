const request = require('supertest');
const app = require('../src/app');
const whatsappPublisher = require('../src/publishers/whatsapp.publisher');
const env = require('../src/config/env');

describe('WhatsApp Channel (Newsletter) Integration Tests', () => {

    beforeEach(() => {
        // Limpa estado do publisher antes de cada teste
        whatsappPublisher.sock = null;
        whatsappPublisher.isReady = false;
        whatsappPublisher._cachedDestination = null;
        whatsappPublisher._cachedGroupId = null;
    });

    test('1. resolveChannel deve aceitar JID direto terminado em @newsletter', async () => {
        const directJid = '120363385731234567@newsletter';
        const result = await whatsappPublisher.resolveChannel(directJid);
        expect(result).toEqual({
            id: directJid,
            name: directJid,
            type: 'channel'
        });
    });

    test('2. resolveChannel deve resolver canal via link de convite (whatsapp.com/channel/...)', async () => {
        whatsappPublisher.sock = {
            newsletterMetadata: jest.fn().mockResolvedValue({
                id: '120363999999999999@newsletter',
                thread_metadata: {
                    name: { text: 'OfertaLar' }
                }
            })
        };

        const link = 'https://whatsapp.com/channel/0029Vb8oLar12345';
        const result = await whatsappPublisher.resolveChannel(link);

        expect(whatsappPublisher.sock.newsletterMetadata).toHaveBeenCalledWith('invite', '0029Vb8oLar12345');
        expect(result).toEqual({
            id: '120363999999999999@newsletter',
            name: 'OfertaLar',
            type: 'channel'
        });
    });

    test('3. resolveChannel deve buscar canal por nome na conta conectada', async () => {
        whatsappPublisher.sock = {};
        const mockChannels = [
            { id: '120363111111111111@newsletter', name: 'Canal Noticias' },
            { id: '120363222222222222@newsletter', name: 'OfertaLar' }
        ];
        jest.spyOn(whatsappPublisher, 'getSubscribedChannels').mockResolvedValue(mockChannels);

        const result = await whatsappPublisher.resolveChannel('OfertaLar');

        expect(result).toEqual({
            id: '120363222222222222@newsletter',
            name: 'OfertaLar',
            type: 'channel'
        });
    });

    test('4. getChatId deve priorizar WHATSAPP_TARGET_CHANNEL', async () => {
        const origChannel = env.whatsappTargetChannel;
        env.whatsappTargetChannel = '120363555555555555@newsletter';

        whatsappPublisher.sock = {};
        const chatId = await whatsappPublisher.getChatId();

        expect(chatId).toBe('120363555555555555@newsletter');
        expect(whatsappPublisher._cachedDestination.type).toBe('channel');

        env.whatsappTargetChannel = origChannel;
    });

    test('5. sendTextMessage deve enviar para o canal quando WhatsApp está pronto', async () => {
        whatsappPublisher.isReady = true;
        whatsappPublisher.sock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg-1' } })
        };
        whatsappPublisher._cachedDestination = {
            id: '120363555555555555@newsletter',
            name: 'OfertaLar',
            type: 'channel'
        };

        const sent = await whatsappPublisher.sendTextMessage('Teste no canal');
        expect(sent).toBe(true);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenCalledWith(
            '120363555555555555@newsletter',
            { text: 'Teste no canal' }
        );
    });

    test('6. API GET /api/status deve retornar info do destino configurado', async () => {
        whatsappPublisher._cachedDestination = {
            id: '120363999999999999@newsletter',
            name: 'OfertaLar',
            type: 'channel'
        };

        const res = await request(app).get('/api/status');
        expect(res.status).toBe(200);
        expect(res.body.destination).toBeDefined();
        expect(res.body.destination.name).toBe('OfertaLar');
        expect(res.body.destination.type).toBe('channel');
    });

    test('7. API POST /api/whatsapp/test deve acionar envio para o canal', async () => {
        whatsappPublisher.isReady = true;
        whatsappPublisher.sock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg-test' } })
        };
        whatsappPublisher._cachedDestination = {
            id: '120363999999999999@newsletter',
            name: 'OfertaLar',
            type: 'channel'
        };

        const res = await request(app)
            .post('/api/whatsapp/test')
            .send({ message: 'Mensagem de teste unitário' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenCalledWith(
            '120363999999999999@newsletter',
            { text: 'Mensagem de teste unitário' }
        );
    });
});
