'use strict';

function resolveDiscountMetrics(coupon) {
  if (coupon.discountType && typeof coupon.discountValue === 'number' && coupon.discountValue > 0) {
    return { type: coupon.discountType, value: coupon.discountValue };
  }

  const desc = (coupon.description || '').trim().toUpperCase();

  const percentMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (percentMatch && percentMatch[1]) {
    const val = parseFloat(percentMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return { type: 'percentage', value: val };
    }
  }

  const fixedMatch = desc.match(/(?:R\$\s*|REAIS\s*)?(\d+(?:[.,]\d+)?)\s*(?:OFF|REAIS|DESC)/i);
  if (fixedMatch && fixedMatch[1]) {
    const val = parseFloat(fixedMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return { type: 'fixed', value: val };
    }
  }

  return { type: 'fixed', value: 0 };
}

function calculateDiscountAmount(coupon, productPrice) {
  if (productPrice <= 0) return 0;

  const { type, value } = resolveDiscountMetrics(coupon);
  let discount = 0;

  if (type === 'percentage') {
    discount = (productPrice * value) / 100;
  } else {
    discount = value;
  }

  if (typeof coupon.maxDiscount === 'number' && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  discount = Math.min(discount, productPrice);
  return Math.round(discount * 100) / 100;
}

function isCategoryAllowed(allowedCategories, productCategoryId) {
  if (!allowedCategories || allowedCategories.length === 0 || allowedCategories.includes('*')) {
    return true;
  }

  if (!productCategoryId) {
    return false;
  }

  const normalizedTarget = productCategoryId.trim().toUpperCase();
  return allowedCategories.some(cat => cat.trim().toUpperCase() === normalizedTarget);
}

function evaluateCoupon(coupon, product, referenceDate = new Date()) {
  if (!coupon.active) {
    return {
      coupon,
      isEligible: false,
      rejectionReason: 'Cupom inativo',
      discountAmount: 0,
      finalPriceWithDiscount: product.price
    };
  }

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

  if (!isCategoryAllowed(coupon.allowedCategories, product.categoryId)) {
    return {
      coupon,
      isEligible: false,
      rejectionReason: `Categoria ${product.categoryId || 'NÃO ESPECIFICADA'} não permitida para este cupom`,
      discountAmount: 0,
      finalPriceWithDiscount: product.price
    };
  }

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

function findBestCoupon(product, availableCoupons, referenceDate = new Date()) {
  if (!availableCoupons || availableCoupons.length === 0 || product.price <= 0) {
    return null;
  }

  const eligibleEvaluations = availableCoupons
    .map(coupon => evaluateCoupon(coupon, product, referenceDate))
    .filter(evalResult => evalResult.isEligible);

  if (eligibleEvaluations.length === 0) {
    return null;
  }

  eligibleEvaluations.sort((a, b) => {
    if (b.discountAmount !== a.discountAmount) {
      return b.discountAmount - a.discountAmount;
    }

    const aMin = a.coupon.minValue ?? 0;
    const bMin = b.coupon.minValue ?? 0;
    if (aMin !== bMin) {
      return aMin - bMin;
    }

    return new Date(a.coupon.expiresAt).getTime() - new Date(b.coupon.expiresAt).getTime();
  });

  return eligibleEvaluations[0].coupon;
}

module.exports = {
  resolveDiscountMetrics,
  calculateDiscountAmount,
  isCategoryAllowed,
  evaluateCoupon,
  findBestCoupon
};
