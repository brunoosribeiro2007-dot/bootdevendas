'use strict';

const { findBestCoupon, evaluateCoupon, calculateDiscountAmount } = require('../src/modules/coupons/matchingEngine');
const { formatOfferMessage } = require('../src/modules/coupons/messageFormatter');

describe('Smart Coupon Module - Matching Engine & Formatter', () => {
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  test('Deve rejeitar cupom inativo', () => {
    const coupon = {
      code: 'INATIVO',
      description: '10% OFF',
      allowedCategories: ['*'],
      expiresAt: futureDate,
      active: false
    };
    const product = { id: '1', title: 'Teste', price: 100, link: 'https://meli.la/1' };
    const evalResult = evaluateCoupon(coupon, product);
    expect(evalResult.isEligible).toBe(false);
    expect(evalResult.rejectionReason).toContain('inativo');
  });

  test('Deve rejeitar cupom expirado', () => {
    const coupon = {
      code: 'EXPIRADO',
      description: '10% OFF',
      allowedCategories: ['*'],
      expiresAt: pastDate,
      active: true
    };
    const product = { id: '1', title: 'Teste', price: 100, link: 'https://meli.la/1' };
    const evalResult = evaluateCoupon(coupon, product);
    expect(evalResult.isEligible).toBe(false);
    expect(evalResult.rejectionReason).toContain('expirado');
  });

  test('Deve rejeitar se o preço for menor que minValue', () => {
    const coupon = {
      code: 'MINIMO200',
      description: 'R$ 20 OFF',
      minValue: 200,
      allowedCategories: ['*'],
      expiresAt: futureDate,
      active: true
    };
    const product = { id: '1', title: 'Teste', price: 150, link: 'https://meli.la/1' };
    const evalResult = evaluateCoupon(coupon, product);
    expect(evalResult.isEligible).toBe(false);
    expect(evalResult.rejectionReason).toContain('abaixo do valor mínimo');
  });

  test('Deve validar categoria específica e permitir wildcard (*)', () => {
    const couponCategory = {
      code: 'CASA',
      description: '10% OFF',
      allowedCategories: ['MLB1574'],
      expiresAt: futureDate,
      active: true
    };
    const productTech = { id: '1', title: 'Mouse', price: 100, categoryId: 'MLB1051', link: 'https://meli.la/1' };
    const productCasa = { id: '2', title: 'Panela', price: 100, categoryId: 'MLB1574', link: 'https://meli.la/2' };

    expect(evaluateCoupon(couponCategory, productTech).isEligible).toBe(false);
    expect(evaluateCoupon(couponCategory, productCasa).isEligible).toBe(true);
  });

  test('Deve selecionar o cupom de maior benefício financeiro (Desempate)', () => {
    const couponFixed = {
      code: 'FIXO30',
      description: 'R$ 30 OFF',
      discountType: 'fixed',
      discountValue: 30,
      minValue: 100,
      allowedCategories: ['*'],
      expiresAt: futureDate,
      active: true
    };
    const couponPercent = {
      code: 'PERCENT15',
      description: '15% OFF',
      discountType: 'percentage',
      discountValue: 15,
      minValue: 100,
      allowedCategories: ['*'],
      expiresAt: futureDate,
      active: true
    };

    // Para produto de R$ 300: 15% = R$ 45 (maior que R$ 30)
    const product = { id: '1', title: 'Air Fryer', price: 300, link: 'https://meli.la/1' };
    const best = findBestCoupon(product, [couponFixed, couponPercent]);
    expect(best).not.toBeNull();
    expect(best.code).toBe('PERCENT15');
  });

  test('Deve respeitar maxDiscount em cupom percentual', () => {
    const couponCapped = {
      code: 'CAP50',
      description: '20% OFF',
      discountType: 'percentage',
      discountValue: 20,
      maxDiscount: 50,
      allowedCategories: ['*'],
      expiresAt: futureDate,
      active: true
    };
    // 20% de 1000 = 200, mas teto é 50
    const discount = calculateDiscountAmount(couponCapped, 1000);
    expect(discount).toBe(50);
  });

  test('Deve formatar mensagem sem cupom de forma limpa sem linhas soltas', () => {
    const product = { id: '1', title: 'Produto Sem Cupom', price: 100, link: 'https://meli.la/1' };
    const msg = formatOfferMessage(product, null);
    expect(msg).toContain('*Produto Sem Cupom*');
    expect(msg).toContain('https://meli.la/1');
    expect(msg).not.toContain('Use o cupom');
    expect(msg).not.toContain('\n\n\n');
  });

  test('Deve formatar mensagem com cupom destacado e instruções claras', () => {
    const coupon = {
      code: 'TOP10',
      description: '10% OFF',
      minValue: 100,
      allowedCategories: ['*'],
      expiresAt: futureDate,
      active: true
    };
    const product = { id: '1', title: 'Produto Com Cupom', price: 200, oldPrice: 250, link: 'https://meli.la/1' };
    const msg = formatOfferMessage(product, coupon);
    expect(msg).toContain('🎟️ Use o cupom: *TOP10* (10% OFF)');
    expect(msg).toContain('🔥 Preço com cupom:');
    expect(msg).toContain('⚠️ Válido para compras acima de R$');
  });
});
