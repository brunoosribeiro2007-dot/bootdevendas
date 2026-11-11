const gamerCopywriter = require('../src/services/gamerCopywriter.service');

describe('GamerCopywriterService - Dynamic Copywriting Templates', () => {
  const sampleGpu = {
    title: 'Placa de Vídeo RTX 4060 8GB GDDR6 MSI Ventus 2X Black OC',
    price: 1899.90,
    old_price: 2399.00,
    link: 'https://www.mercadolivre.com.br/placa-de-video-rtx-4060/p/MLB12345',
    freeShipping: true,
    coupon: 'GAMER100',
    pixDiscountPercent: 10
  };

  const sampleMonitor = {
    title: 'Monitor Gamer 24 Pol 165Hz 1ms IPS Full HD AOC Hero',
    price: 849.00,
    old_price: 1099.00,
    link: 'https://www.amazon.com.br/dp/B08XYZ123',
    freeShipping: true
  };

  test('should generate high-converting WhatsApp template with correct emojis and formatting', async () => {
    const message = await gamerCopywriter.formatForWhatsApp(sampleGpu);

    // Emojis e Header limpo
    expect(message).toContain('🎮');
    expect(message).toContain('PLACA DE VÍDEO');
    expect(message).toContain('Placa de Vídeo RTX 4060');

    // Preços e Formatação WhatsApp (*bold*, ~strike~)
    expect(message).toContain('De: ~R$ 2.399,00~');
    expect(message).toContain('à vista no PIX');
    expect(message).toContain('10x de R$ 189,99');

    // Benefícios e Link
    expect(message).toContain('Frete Grátis');
    expect(message).toContain('🎟️ Cupom diário: *GAMER100*');
    expect(message).toContain('⚠️ *Cupons possuem limite de resgate.*');
    expect(message).toContain('🛒 Compre aqui:');
  });

  test('should generate clean Telegram HTML template without illegal markdown entities', async () => {
    const tgMessage = await gamerCopywriter.formatForTelegram(sampleMonitor);

    // Tags HTML válidas no Telegram
    expect(tgMessage).toContain('MONITOR GAMER');
    expect(tgMessage).toContain('<s>R$ 1.099,00</s>');
    expect(tgMessage).toContain('<b>R$ 849,00</b>');
    expect(tgMessage).toContain('Frete Grátis');
    expect(tgMessage).toContain('<a href=');
    expect(tgMessage).toContain('Compre aqui');
  });

  test('should correctly inject Amazon affiliate tag into product link', () => {
    const rawAmazon = 'https://www.amazon.com.br/dp/B08XYZ123';
    const tagged = gamerCopywriter.applyAffiliateTag(rawAmazon, 'amazon');
    expect(tagged).toContain('tag=');
  });

  test('should correctly inject Mercado Livre tag into non-meli.la link', () => {
    const rawMeli = 'https://produto.mercadolivre.com.br/MLB-12345';
    const tagged = gamerCopywriter.applyAffiliateTag(rawMeli, 'mercadolivre');
    expect(tagged).toContain('matt_tool=');
  });
});
