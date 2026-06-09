const formatterService = require('../src/services/formatter.service');

describe('Formatter Service', () => {
  const mockProduct = {
    title: 'Smartphone Test',
    price: 1999.99,
    link: 'http://test.com',
    imageUrl: 'http://image.com/1.jpg',
    description: 'Smartphone Test',
  };

  test('generateRawMessage should include all fields', async () => {
    const msg = await formatterService.generateRawMessage(mockProduct);
    expect(msg).toContain(mockProduct.imageUrl);
    expect(msg).toContain(mockProduct.title);
    expect(msg).toContain('R$ 1999.99');
    expect(msg).toContain(mockProduct.link);
    expect(msg).toContain(mockProduct.description);
  });

  test('generateFormattedMessage should include correct clean message fields', async () => {
    const productWithPromo = {
      ...mockProduct,
      oldPrice: 2499.99,
      discountPercent: 20,
      coupon: 'CUPOM50'
    };
    
    const msg = await formatterService.generateFormattedMessage(productWithPromo);
    expect(msg).toContain('MERCADO LIVRE ARRASA 💛');
    expect(msg).toContain(productWithPromo.title);
    expect(msg).toContain('De ~R$ 2499,99~');
    expect(msg).toContain('💵 Por R$ 1999,99');
    expect(msg).toContain('😱 20% OFF');
    expect(msg).toContain('🏷️ Use o cupom: CUPOM50');
    expect(msg).toContain('Compre aqui:');
  });
});
