const request = require('supertest');
const app = require('../src/app');
const whatsappPublisher = require('../src/publishers/whatsapp.publisher');
const env = require('../src/config/env');

describe('WhatsApp Channel and Multi-Destination Integration Tests', () => {

    beforeEach(() => {
        // Limpa estado do publisher antes de cada teste
        whatsappPublisher.sock = null;
        whatsappPublisher.isReady = false;
        whatsappPublisher._cachedDestination = null;
        whatsappPublisher._cachedDestinations = null;
        whatsappPublisher._cachedChannels = null;
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

    test('4. resolveGroup deve resolver grupo via link de convite (chat.whatsapp.com/...)', async () => {
        whatsappPublisher.sock = {
            groupGetInviteInfo: jest.fn().mockResolvedValue({
                id: '120363888888888888',
                subject: 'OfertaLar Grupo VIP'
            })
        };

        const link = 'https://chat.whatsapp.com/AbCdEfGhIjK12345';
        const result = await whatsappPublisher.resolveGroup(link);

        expect(whatsappPublisher.sock.groupGetInviteInfo).toHaveBeenCalledWith('AbCdEfGhIjK12345');
        expect(result).toEqual({
            id: '120363888888888888@g.us',
            name: 'OfertaLar Grupo VIP',
            type: 'group'
        });
    });

    test('5. getDestinations deve incluir CANAL e GRUPO simultaneamente quando ambos configurados', async () => {
        const origChannel = env.whatsappTargetChannel;
        const origGroup = env.whatsappTargetGroup;

        env.whatsappTargetChannel = '120363111111111111@newsletter';
        env.whatsappTargetGroup = '120363222222222222@g.us';

        whatsappPublisher.sock = {};
        const destinations = await whatsappPublisher.getDestinations();

        expect(destinations).toHaveLength(2);
        expect(destinations[0]).toEqual({
            id: '120363111111111111@newsletter',
            name: '120363111111111111@newsletter',
            type: 'channel'
        });
        expect(destinations[1]).toEqual({
            id: '120363222222222222@g.us',
            name: '120363222222222222@g.us',
            type: 'group'
        });

        env.whatsappTargetChannel = origChannel;
        env.whatsappTargetGroup = origGroup;
    });

    test('6. sendTextMessage deve disparar para o CANAL e o GRUPO juntos', async () => {
        whatsappPublisher.isReady = true;
        whatsappPublisher.sock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg-1' } })
        };
        whatsappPublisher._cachedDestinations = [
            { id: '120363111111111111@newsletter', name: 'OfertaLar Canal', type: 'channel' },
            { id: '120363222222222222@g.us', name: 'OfertaLar Grupo', type: 'group' }
        ];

        const sent = await whatsappPublisher.sendTextMessage('Teste conjunto');
        expect(sent).toBe(true);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenCalledTimes(2);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenNthCalledWith(
            1,
            '120363111111111111@newsletter',
            { text: 'Teste conjunto' }
        );
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenNthCalledWith(
            2,
            '120363222222222222@g.us',
            { text: 'Teste conjunto' }
        );
    });

    test('7. publish deve enviar a oferta para o CANAL e o GRUPO juntos', async () => {
        whatsappPublisher.isReady = true;
        whatsappPublisher.sock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'pub-1' } })
        };
        whatsappPublisher._cachedDestinations = [
            { id: '120363111111111111@newsletter', name: 'OfertaLar Canal', type: 'channel' },
            { id: '120363222222222222@g.us', name: 'OfertaLar Grupo', type: 'group' }
        ];

        const item = {
            id: 10,
            product_id: 'MLB123',
            title: 'Fritadeira Air Fryer',
            formatted_message: '🔥 Super Promoção Air Fryer',
            image_url: null
        };

        const result = await whatsappPublisher.publish(item);
        expect(result).toBe(true);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenCalledTimes(2);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenNthCalledWith(
            1,
            '120363111111111111@newsletter',
            { text: item.formatted_message }
        );
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenNthCalledWith(
            2,
            '120363222222222222@g.us',
            { text: item.formatted_message }
        );
    });

    test('8. API GET /api/status deve retornar info dos múltiplos destinos configurados', async () => {
        whatsappPublisher._cachedDestinations = [
            { id: '120363111111111111@newsletter', name: 'OfertaLar Canal', type: 'channel' },
            { id: '120363222222222222@g.us', name: 'OfertaLar Grupo', type: 'group' }
        ];

        const res = await request(app)
            .get('/api/status')
            .auth('admin', 'admin123');

        expect(res.status).toBe(200);
        expect(res.body.destination).toBeDefined();
        expect(res.body.destination.count).toBe(2);
        expect(res.body.destination.type).toBe('multi');
        expect(res.body.destination.destinations).toHaveLength(2);
    });

    test('9. API POST /api/whatsapp/test deve acionar envio para canal e grupo', async () => {
        whatsappPublisher.isReady = true;
        whatsappPublisher.sock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg-test' } })
        };
        whatsappPublisher._cachedDestinations = [
            { id: '120363111111111111@newsletter', name: 'OfertaLar Canal', type: 'channel' },
            { id: '120363222222222222@g.us', name: 'OfertaLar Grupo', type: 'group' }
        ];

        const res = await request(app)
            .post('/api/whatsapp/test')
            .auth('admin', 'admin123')
            .send({ message: 'Mensagem de teste unitário' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(whatsappPublisher.sock.sendMessage).toHaveBeenCalledTimes(2);
    });
});
