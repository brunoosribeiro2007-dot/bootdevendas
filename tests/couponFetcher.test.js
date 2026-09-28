const couponFetcher = require('../src/services/couponFetcher.service');

describe('CouponFetcher Service & Daily Expiration', () => {
  afterEach(async () => {
    // Limpa cupom em memória após cada teste
    await couponFetcher.setActiveDailyCoupon(null);
  });

  test('deve definir e recuperar o cupom ativo para o dia de hoje', async () => {
    await couponFetcher.setActiveDailyCoupon('CUPOMHOJE10');
    const active = await couponFetcher.getActiveDailyCoupon();
    expect(active).toBe('CUPOMHOJE10');
  });

  test('resolveCouponForProduct deve priorizar cupom manual ativo do dia', async () => {
    await couponFetcher.setActiveDailyCoupon('CUPOMTOP20');
    const mockProduct = {
      title: 'Fritadeira Air Fryer',
      price: 299,
      coupon: 'CUPOMVELHO'
    };

    const resolved = await couponFetcher.resolveCouponForProduct(mockProduct);
    expect(resolved).toBe('CUPOMTOP20');
  });

  test('deve permitir desativar o cupom manual', async () => {
    await couponFetcher.setActiveDailyCoupon('TESTE123');
    let active = await couponFetcher.getActiveDailyCoupon();
    expect(active).toBe('TESTE123');

    await couponFetcher.setActiveDailyCoupon(null);
    active = await couponFetcher.getActiveDailyCoupon();
    // Sem cupom manual, não deve retornar TESTE123
    expect(active).not.toBe('TESTE123');
  });
});
