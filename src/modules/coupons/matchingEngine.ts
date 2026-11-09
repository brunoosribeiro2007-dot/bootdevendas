/**
 * ==============================================================================
 * SMART COUPON MODULE - MATCHING ENGINE (Funções Puras)
 * ==============================================================================
 */

import { Coupon, ProductData, CouponEvaluation } from './types';

/**
 * Infere o valor e tipo de desconto a partir da descrição caso não declarados explicitamente.
 */
export function resolveDiscountMetrics(coupon: Coupon): { type: 'percentage' | 'fixed'; value: number } {
  if (coupon.discountType && typeof coupon.discountValue === 'number' && coupon.discountValue > 0) {
    return { type: coupon.discountType, value: coupon.discountValue };
  }

  const desc = coupon.description.trim().toUpperCase();

  // Tenta capturar percentual (ex: "15%", "15 % OFF")
  const percentMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (percentMatch && percentMatch[1]) {
    const val = parseFloat(percentMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return { type: 'percentage', value: val };
    }
  }

  // Tenta capturar valor monetário (ex: "R$ 50 OFF", "50 REAIS", "30 OFF")
  const fixedMatch = desc.match(/(?:R\$\s*|REAIS\s*)?(\d+(?:[.,]\d+)?)\s*(?:OFF|REAIS|DESC)/i);
  if (fixedMatch && fixedMatch[1]) {
    const val = parseFloat(fixedMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return { type: 'fixed', value: val };
    }
  }

  return { type: 'fixed', value: 0 };
}

/**
 * Calcula o desconto monetário exato que o cupom gerará para o cliente.
 */
export function calculateDiscountAmount(coupon: Coupon, productPrice: number): number {
  if (productPrice <= 0) return 0;

  const { type, value } = resolveDiscountMetrics(coupon);
  let discount = 0;

  if (type === 'percentage') {
    discount = (productPrice * value) / 100;
  } else {
    discount = value;
  }

  // Aplica teto máximo de desconto se houver
  if (typeof coupon.maxDiscount === 'number' && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  // O desconto não pode ultrapassar o preço integral do produto
  discount = Math.min(discount, productPrice);

  return Math.round(discount * 100) / 100;
}

/**
 * Valida se a categoria do produto é autorizada para o cupom.
 */
export function isCategoryAllowed(allowedCategories: readonly string[], productCategoryId?: string): boolean {
  if (!allowedCategories || allowedCategories.length === 0 || allowedCategories.includes('*')) {
    return true;
  }

  if (!productCategoryId) {
    return false;
  }

  const normalizedTarget = productCategoryId.trim().toUpperCase();
  return allowedCategories.some(cat => cat.trim().toUpperCase() === normalizedTarget);
}

/**
 * Avalia se um cupom específico pode ser aplicado a um produto.
 */
export function evaluateCoupon(
  coupon: Coupon,
  product: ProductData,
  referenceDate: Date = new Date()
): CouponEvaluation {
  // 1. Validação de ativação
  if (!coupon.active) {
    return {
      coupon,
      isEligible: false,
      rejectionReason: 'Cupom inativo',
      discountAmount: 0,
      finalPriceWithDiscount: product.price
    };
  }

  // 2. Validação de expiração
  const expiresAtTimestamp = new Date(coupon.expiresAt).getTime();
  if (isNaN(expiresAtTimestamp) || expiresAtTimestamp <= referenceDate.getTime()) {
    return {
      coupon,
      isEligible: false,
      rejectionReason: 'Cupom expirado',
      discountAmount: 0,
      finalPriceWithDiscount: product.price
    };
  }

  // 3. Validação de valor mínimo de compra
  if (typeof coupon.minValue === 'number' && coupon.minValue > 0) {
    if (product.price < coupon.minValue) {
      return {
        coupon,
        isEligible: false,
        rejectionReason: `Preço do produto (R$ ${product.price}) abaixo do valor mínimo (R$ ${coupon.minValue})`,
        discountAmount: 0,
        finalPriceWithDiscount: product.price
      };
    }
  }

  // 4. Validação de categoria
  if (!isCategoryAllowed(coupon.allowedCategories, product.categoryId)) {
    return {
      coupon,
      isEligible: false,
      rejectionReason: `Categoria ${product.categoryId || 'NÃO ESPECIFICADA'} não permitida para este cupom`,
      discountAmount: 0,
      finalPriceWithDiscount: product.price
    };
  }

  // 5. Cálculo do desconto efetivo
  const discountAmount = calculateDiscountAmount(coupon, product.price);

  if (discountAmount <= 0) {
    return {
      coupon,
      isEligible: false,
      rejectionReason: 'Valor de desconto nulo ou inválido',
      discountAmount: 0,
      finalPriceWithDiscount: product.price
    };
  }

  return {
    coupon,
    isEligible: true,
    discountAmount,
    finalPriceWithDiscount: Math.max(0, product.price - discountAmount)
  };
}

/**
 * Matching Engine: Função pura que seleciona o cupom mais vantajoso.
 * 
 * Critérios de desempate:
 * 1. Maior economia monetária (R$).
 * 2. Menor exigência de valor mínimo (`minValue`).
 * 3. Expiração mais próxima (urgência).
 */
export function findBestCoupon(
  product: ProductData,
  availableCoupons: readonly Coupon[],
  referenceDate: Date = new Date()
): Coupon | null {
  if (!availableCoupons || availableCoupons.length === 0 || product.price <= 0) {
    return null;
  }

  const eligibleEvaluations = availableCoupons
    .map(coupon => evaluateCoupon(coupon, product, referenceDate))
    .filter((evalResult): evalResult is CouponEvaluation & { isEligible: true } => evalResult.isEligible);

  if (eligibleEvaluations.length === 0) {
    return null;
  }

  eligibleEvaluations.sort((a, b) => {
    // 1. Maior desconto em dinheiro
    if (b.discountAmount !== a.discountAmount) {
      return b.discountAmount - a.discountAmount;
    }

    // 2. Menor barreira de entrada (minValue)
    const aMin = a.coupon.minValue ?? 0;
    const bMin = b.coupon.minValue ?? 0;
    if (aMin !== bMin) {
      return aMin - bMin;
    }

    // 3. Prioriza o que vence mais rápido
    return new Date(a.coupon.expiresAt).getTime() - new Date(b.coupon.expiresAt).getTime();
  });

  return eligibleEvaluations[0].coupon;
}
