const formatterService = require('../src/services/formatter.service');

describe('Formatter Service', () => {
  test('generateFormattedMessage should include correct clean message fields for Mercado Livre', async () => {
    const productWithPromo = {
      title: 'Smartphone Test',
      price: 1999.99,
      link: 'http://test.com',
      imageUrl: 'http://image.com',
      oldPrice: 2499.99,
      discountPercent: 20,
      coupon: 'CUPOM50'
    };
    
    const msg = await formatterService.generateFormattedMessage(productWithPromo);
    expect(msg).toContain(productWithPromo.title);
    expect(msg).toContain('R$ 1999,99');
    expect(msg).toContain('*CUPOM50*');
    expect(msg).toContain('🛒 Link:');
  });

  test('generateFormattedMessage should format integer prices and headlines like TRICO PRA FICAR NO ESTILO', async () => {
    const productIntegerPrice = {
      title: 'Camiseta Tricô Modal Canelada',
      price: 55,
      link: 'https://meli.la/2bsigWb',
      imageUrl: 'http://image.com/trico.jpg',
      coupon: 'MELHORCUPOM'
    };

    const msg = await formatterService.generateFormattedMessage(productIntegerPrice);
    expect(msg).toContain('Camiseta Tricô Modal Canelada');
    expect(msg).toContain('R$ 55');
    expect(msg).toContain('*MELHORCUPOM*');
    expect(msg).toContain('https://meli.la/2bsigWb');
  });

  test('generateHeadline should not misclassify "elétrico" as tricô', () => {
    const title = 'Bebedouro de mesa Cadence gela água refrigerado elétrico galão aguô BEB110 branco';
    const headline = formatterService.generateHeadline(title);
    expect(headline).not.toContain('TRICO');
    expect(headline).toBe('PURIFICADOR DE ÁGUA EM PROMOÇÃO');
  });

  test('generateFormattedMessage should extract and link coupon code from text like "Cupom DESCONTO10"', async () => {
    const productWithTextCoupon = {
      title: 'Bebedouro de mesa Cadence gela água refrigerado elétrico galão aguô BEB110 branco',
      price: 348.23,
      link: 'https://meli.la/2cvajqho',
      imageUrl: 'http://image.com/bebedouro.jpg',
      coupon: 'Cupom DESCONTO10'
    };

    const msg = await formatterService.generateFormattedMessage(productWithTextCoupon);
    expect(msg).not.toContain('TRICO');
    expect(msg).toContain('PURIFICADOR DE ÁGUA EM PROMOÇÃO');
    expect(msg).toContain('*DESCONTO10*');
  });

  test('cleanProductTitle and generateHeadline should simplify RAM title and headline', () => {
    const rawTitle = 'Memoria Mancer Lumina, Rgb, 8gb (1x8gb), Ddr4, 3200mhz, Cl19';
    const headline = formatterService.generateHeadline(rawTitle);
    const cleaned = formatterService.cleanProductTitle(rawTitle);

    expect(headline).toBe('MEMÓRIA RAM EM PROMOÇÃO');
    expect(cleaned).not.toContain('(1x8gb)');
    expect(cleaned).not.toContain(',');
    expect(cleaned).toBe('Memoria Mancer Lumina Rgb 8gb Ddr4 3200mhz Cl19');
  });

  test('generateHeadline should not call a controller stand "CONTROLE PS5"', () => {
    const standTitle = 'Suporte Duplo Para Controles De Ps5 Ps4 Porta Base Dualsense';
    const headline = formatterService.generateHeadline(standTitle);
    expect(headline).not.toContain('CONTROLE PS5');
    expect(headline).toBe('SUPORTE PARA CONTROLES');
  });

  test('generateHeadline should not call a RAM dissipator "MEMÓRIA RAM EM PROMOÇÃO"', () => {
    const dissipatorTitle = 'Dissipador De Memória Ram Ddr3/ddr4/ddr5 + Thermal Pad';
    const headline = formatterService.generateHeadline(dissipatorTitle);
    expect(headline).not.toBe('MEMÓRIA RAM EM PROMOÇÃO');
  });
});
