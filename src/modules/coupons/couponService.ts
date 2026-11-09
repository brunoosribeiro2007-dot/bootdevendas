/**
 * ==============================================================================
 * SMART COUPON MODULE - COUPON SERVICE (Orquestrador / Fachada)
 * ==============================================================================
 */

import { ICouponStore, ProductData, Coupon, BroadcastPlatform } from './types';
import { findBestCoupon } from './matchingEngine';
import { formatOfferMessage } from './messageFormatter';

export interface ProcessProductResult {
  readonly selectedCoupon: Coupon | null;
  readonly formattedMessage: string;
}

export class CouponService {
  constructor(private readonly store: ICouponStore) {}

  /**
   * Avalia o produto contra todos os cupons ativos no store,
   * encontra o mais vantajoso e retorna a mensagem pronta para envio.
   */
  public async prepareBroadcastMessage(
    product: ProductData,
    platform: BroadcastPlatform = 'whatsapp'
  ): Promise<ProcessProductResult> {
    const activeCoupons = await this.store.listActiveCoupons();
    const bestCoupon = findBestCoupon(product, activeCoupons);
    const formattedMessage = formatOfferMessage(product, bestCoupon, { platform });

    return {
      selectedCoupon: bestCoupon,
      formattedMessage
    };
  }

  public async registerCoupon(coupon: Coupon): Promise<void> {
    await this.store.addCoupon(coupon);
  }

  public async disableCoupon(code: string): Promise<boolean> {
    return await this.store.deactivateCoupon(code);
  }

  public async enableCoupon(code: string): Promise<boolean> {
    return await this.store.activateCoupon(code);
  }

  public async listValidCoupons(): Promise<readonly Coupon[]> {
    return await this.store.listActiveCoupons();
  }
}
