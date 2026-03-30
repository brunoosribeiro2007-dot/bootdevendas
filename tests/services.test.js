const formatterService = require('../src/services/formatter.service');

describe('Formatter Service', () => {
  const mockProduct = {
    title: 'Smartphone Test',
    price: 1999.99,
    link: 'http://test.com',
    imageUrl: 'http://image.com/1.jpg',
    description: 'Smartphone Test',
  };

  test('generateRawMessage should include all fields', () => {
    const msg = formatterService.generateRawMessage(mockProduct);
    expect(msg).toContain(mockProduct.imageUrl);
    expect(msg).toContain(mockProduct.title);
    expect(msg).toContain('R$ 1999.99');
    expect(msg).toContain(mockProduct.link);
    expect(msg).toContain(mockProduct.description);
  });

  test('generateFormattedMessage should include icons and fields', () => {
    const msg = formatterService.generateFormattedMessage(mockProduct);
    expect(msg).toContain('🖼');
    expect(msg).toContain('📦');
    expect(msg).toContain('📝');
    expect(msg).toContain('💰');
    expect(msg).toContain('🔗');
    expect(msg).toContain(mockProduct.title);
  });
});
