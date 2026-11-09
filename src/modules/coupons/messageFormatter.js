'use strict';

const { calculateDiscountAmount } = require('./matchingEngine');

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function buildCouponBlock(coupon, productPrice, platform = 'whatsapp') {
  const codeFormatted = platform === 'whatsapp' ? `*${coupon.code}*` : `\`${coupon.code}\``;
  const discountSaved = calculateDiscountAmount(coupon, productPrice);
  const finalPrice = Math.max(0, productPrice - discountSaved);

  const lines = [
    `🎟️ Use o cupom: ${codeFormatted} (${coupon.description})`
  ];

  if (discountSaved > 0) {
    lines.push(`🔥 Preço com cupom: ${brlFormatter.format(finalPrice)} (Economia de ${brlFormatter.format(discountSaved)})`);
  }

  if (typeof coupon.minValue === 'number' && coupon.minValue > 0) {
    lines.push(`⚠️ Válido para compras acima de ${brlFormatter.format(coupon.minValue)}`);
  }

  return lines.join('\n');
}

function formatOfferMessage(product, coupon = null, options = {}) {
  const platform = options.platform || 'whatsapp';
  const parts = [];

  parts.push(`*${(product.title || '').trim()}*`);
  parts.push('');

  if (product.oldPrice && product.oldPrice > product.price) {
    const discountPercent = Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100);
    parts.push(`De: ~${brlFormatter.format(product.oldPrice)}~`);
    parts.push(`💰 Por apenas: *${brlFormatter.format(product.price)}* (${discountPercent}% OFF)`);
  } else {
    parts.push(`💰 Por apenas: *${brlFormatter.format(product.price)}*`);
  }

  if (coupon) {
    parts.push('');
    parts.push(buildCouponBlock(coupon, product.price, platform));
  }

  parts.push('');
  parts.push(`🛒 Compre aqui: ${product.link}`);

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = {
  buildCouponBlock,
  formatOfferMessage
};
