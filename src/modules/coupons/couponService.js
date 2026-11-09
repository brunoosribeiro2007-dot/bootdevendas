'use strict';

const { findBestCoupon } = require('./matchingEngine');
const { formatOfferMessage } = require('./messageFormatter');

class CouponService {
  constructor(store) {
    this.store = store;
  }

  async prepareBroadcastMessage(product, platform = 'whatsapp') {
    const activeCoupons = await this.store.listActiveCoupons();
    const bestCoupon = findBestCoupon(product, activeCoupons);
    const formattedMessage = formatOfferMessage(product, bestCoupon, { platform });

    return {
      selectedCoupon: bestCoupon,
      formattedMessage
    };
  }

  async registerCoupon(coupon) {
    await this.store.addCoupon(coupon);
  }

  async disableCoupon(code) {
    return await this.store.deactivateCoupon(code);
  }

  async enableCoupon(code) {
    return await this.store.activateCoupon(code);
  }

  async listValidCoupons() {
    return await this.store.listActiveCoupons();
  }
}

module.exports = {
  CouponService
};
