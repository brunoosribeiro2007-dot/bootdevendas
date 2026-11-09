/**
 * ==============================================================================
 * SMART COUPON MODULE - TYPES & INTERFACES (TypeScript Estrito)
 * ==============================================================================
 */

/**
 * Tipo de cálculo de desconto suportado
 */
export type CouponDiscountType = 'percentage' | 'fixed';

/**
 * Plataformas de disparo suportadas (WhatsApp e Telegram)
 */
export type BroadcastPlatform = 'whatsapp' | 'telegram';

/**
 * Entidade de Cupom com validações e regras de negócio
 */
export interface Coupon {
  /** Código único do cupom (ex: "MELI10", "TECNOLOGIA30") */
  readonly code: string;
  /** Descrição amigável do benefício (ex: "10% OFF", "R$ 30 OFF") */
  readonly description: string;
  /** Tipo explícito do desconto (opcional, inferido da descrição se ausente) */
  readonly discountType?: CouponDiscountType;
  /** Valor numérico do desconto (ex: 10 para 10% ou 30 para R$ 30) */
  readonly discountValue?: number;
  /** Valor mínimo do produto para elegibilidade (opcional) */
  readonly minValue?: number;
  /** Teto máximo de desconto em reais (opcional) */
  readonly maxDiscount?: number;
  /** Categorias permitidas (IDs como ["MLB1051", "MLB1648"] ou ["*"] para geral) */
  readonly allowedCategories: readonly string[];
  /** Data/hora limite de validade no formato ISO 8601 */
  readonly expiresAt: string;
  /** Flag de ativação/desativação rápida */
  readonly active: boolean;
  /** Data de registro do cupom */
  readonly createdAt?: string;
}

/**
 * Dados do produto avaliado para injeção de cupom
 */
export interface ProductData {
  readonly id: string;
  readonly title: string;
  readonly price: number;
  readonly oldPrice?: number;
  readonly categoryId?: string;
  readonly link: string;
  readonly storeName?: string;
}

/**
 * Resultado da avaliação de um cupom contra um produto
 */
export interface CouponEvaluation {
  readonly coupon: Coupon;
  readonly isEligible: boolean;
  readonly rejectionReason?: string;
  /** Valor economizado em reais (R$) */
  readonly discountAmount: number;
  /** Preço final do produto com cupom aplicado */
  readonly finalPriceWithDiscount: number;
}

/**
 * Opções para a formatação da mensagem final
 */
export interface MessageFormatOptions {
  readonly platform?: BroadcastPlatform;
  readonly highlightCoupon?: boolean;
}

/**
 * Contrato de persistência e gerenciamento do Store de Cupons
 */
export interface ICouponStore {
  addCoupon(coupon: Coupon): Promise<void>;
  deactivateCoupon(code: string): Promise<boolean>;
  activateCoupon(code: string): Promise<boolean>;
  getCouponByCode(code: string): Promise<Coupon | null>;
  listActiveCoupons(referenceDate?: Date): Promise<readonly Coupon[]>;
  listAllCoupons(): Promise<readonly Coupon[]>;
  purgeExpiredCoupons(referenceDate?: Date): Promise<number>;
}
