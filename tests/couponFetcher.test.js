const couponFetcher = require('../src/services/couponFetcher.service');
const repository = require('../src/database/repository');

describe('CouponFetcher Service & Daily Expiration', () => {
  afterEach(async () => {
    await couponFetcher.setActiveDailyCoupon(null);
    jest.restoreAllMocks();
  });

  test('deve definir e recuperar o cupom ativo para o dia de hoje', async () => {
    await couponFetcher.setActiveDailyCoupon('CUPOMHOJE10');
    const active = await couponFetcher.getActiveDailyCoupon();
    expect(active).toBe('CUPOMHOJE10');
  });

  test('deve rejeitar cupons bloqueados como TUDOPARACASA', async () => {
    const success = await couponFetcher.setActiveDailyCoupon('TUDOPARACASA');
    expect(success).toBe(false);
    const active = await couponFetcher.getActiveDailyCoupon();
    expect(active).toBeNull();
  });

  test('resolveCouponForProduct deve priorizar cupom manual ativo do dia', async () => {
    await couponFetcher.setActiveDailyCoupon('CUPOMTOP20');
    const mockProduct = {
      title: 'Fritadeira Air Fryer',
      price: 299,
      coupon: 'MELI10'
    };

    const resolved = await couponFetcher.resolveCouponForProduct(mockProduct);
    expect(resolved?.code || resolved).toBe('CUPOMTOP20');
  });

  test('resolveCouponForProduct deve retornar null se não houver cupom manual e produto não tiver cupom', async () => {
    await couponFetcher.setActiveDailyCoupon(null);
    jest.spyOn(repository, 'getActiveCoupons').mockResolvedValue([]);

    const mockProduct = {
      title: 'Fritadeira Air Fryer',
      price: 299
    };

    const resolved = await couponFetcher.resolveCouponForProduct(mockProduct);
    expect(resolved).toBeNull();
  });

  test('resolveCouponForProduct deve ignorar se produto tiver TUDOPARACASA', async () => {
    await couponFetcher.setActiveDailyCoupon(null);
    jest.spyOn(repository, 'getActiveCoupons').mockResolvedValue([]);

    const mockProduct = {
      title: 'Fritadeira Air Fryer',
      price: 299,
      coupon: 'TUDOPARACASA'
    };

    const resolved = await couponFetcher.resolveCouponForProduct(mockProduct);
    expect(resolved).toBeNull();
  });

  test('deve permitir desativar o cupom manual', async () => {
    await couponFetcher.setActiveDailyCoupon('TESTE123');
    let active = await couponFetcher.getActiveDailyCoupon();
    expect(active).toBe('TESTE123');

    await couponFetcher.setActiveDailyCoupon(null);
    active = await couponFetcher.getActiveDailyCoupon();
    expect(active).toBeNull();
  });

  test('extractCouponCode deve extrair cupons de strings complexas', () => {
    expect(couponFetcher.extractCouponCode('Cupom OBA10')).toBe('OBA10');
    expect(couponFetcher.extractCouponCode('código: FESTA20')).toBe('FESTA20');
    expect(couponFetcher.extractCouponCode('PROMO50')).toBe('PROMO50');
    expect(couponFetcher.extractCouponCode('TUDOPARACASA')).toBeNull();
    expect(couponFetcher.extractCouponCode('R$ 20 OFF')).toBeNull();
  });
});
