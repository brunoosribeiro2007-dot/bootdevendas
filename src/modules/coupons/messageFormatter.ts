/**
 * ==============================================================================
 * SMART COUPON MODULE - MESSAGE FORMATTER
 * ==============================================================================
 */

import { Coupon, ProductData, MessageFormatOptions } from './types';
import { calculateDiscountAmount } from './matchingEngine';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Constrói o bloco visual do cupom de desconto com instruções claras
 */
export function buildCouponBlock(
  coupon: Coupon,
  productPrice: number,
  platform: 'whatsapp' | 'telegram' = 'whatsapp'
): string {
  const codeFormatted = platform === 'whatsapp' ? `*${coupon.code}*` : `\`${coupon.code}\``;
  const discountSaved = calculateDiscountAmount(coupon, productPrice);
  const finalPrice = Math.max(0, productPrice - discountSaved);

  const lines: string[] = [
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

/**
 * Formata a mensagem completa de oferta.
 * Caso nenhum cupom seja elegível, não adiciona linhas ou espaços soltos.
 */
export function formatOfferMessage(
  product: ProductData,
  coupon: Coupon | null = null,
  options: MessageFormatOptions = {}
): string {
  const platform = options.platform || 'whatsapp';
  const parts: string[] = [];

  // 1. Título do produto
  parts.push(`*${product.title.trim()}*`);
  parts.push('');

  // 2. Preço de / por
  if (product.oldPrice && product.oldPrice > product.price) {
    const discountPercent = Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100);
    parts.push(`De: ~${brlFormatter.format(product.oldPrice)}~`);
    parts.push(`💰 Por apenas: *${brlFormatter.format(product.price)}* (${discountPercent}% OFF)`);
  } else {
    parts.push(`💰 Por apenas: *${brlFormatter.format(product.price)}*`);
  }

  // 3. Injeção dinâmica do cupom (se elegível)
  if (coupon) {
    parts.push('');
    parts.push(buildCouponBlock(coupon, product.price, platform));
  }

  // 4. Link oficial de afiliado
  parts.push('');
  parts.push(`🛒 Compre aqui: ${product.link}`);

  // Sanitização de espaços em branco e múltiplos saltos de linha
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
