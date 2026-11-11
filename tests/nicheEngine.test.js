const { normalizeNicheId, getNicheProfile, NICHES } = require('../src/config/niches');
const { getDynamicSearchQuery, extractRealCouponData } = require('../src/helpers/miningSeeds');
const { formatDeterministicPost, evaluateAndFormatProduct, OPENING_EMOJIS } = require('../src/services/aiCurator.service');

describe('Unified Multi-Niche & Real Coupons Engine', () => {
  describe('Niche Profiles & Normalization', () => {
    test('should normalize gamer aliases correctly', () => {
      expect(normalizeNicheId('pc_gamer')).toBe('pc_gamer');
      expect(normalizeNicheId('hardware')).toBe('pc_gamer');
      expect(normalizeNicheId('gamer')).toBe('pc_gamer');
      expect(normalizeNicheId('tech')).toBe('pc_gamer');
    });

    test('should normalize home/casa aliases correctly', () => {
      expect(normalizeNicheId('casa')).toBe('casa');
      expect(normalizeNicheId('ofertalar')).toBe('casa');
      expect(normalizeNicheId('lar')).toBe('casa');
      expect(normalizeNicheId('home')).toBe('casa');
      expect(normalizeNicheId('')).toBe('casa');
      expect(normalizeNicheId(null)).toBe('casa');
    });

    test('should return correct profile configurations', () => {
      const pcProfile = getNicheProfile('pc_gamer');
      expect(pcProfile.id).toBe('pc_gamer');
      expect(pcProfile.copywriter).toBe('gamer');
      expect(pcProfile.seedFile).toBe('initial_products_pc.json');
      expect(pcProfile.minDiscountPercent).toBe(10);

      const casaProfile = getNicheProfile('casa');
      expect(casaProfile.id).toBe('casa');
      expect(casaProfile.copywriter).toBe('standard');
      expect(casaProfile.seedFile).toBe('initial_products_casa.json');
      expect(casaProfile.minDiscountPercent).toBe(15);
    });
  });

  describe('Dynamic Mining Seeds & Randomization', () => {
    test('should return dynamic query with offset and sort for pc_gamer', () => {
      const queryObj = getDynamicSearchQuery('pc_gamer');
      expect(queryObj).toHaveProperty('query');
      expect(queryObj).toHaveProperty('offset');
      expect(queryObj).toHaveProperty('sort');
      expect(typeof queryObj.query).toBe('string');
      expect(queryObj.offset).toBeGreaterThanOrEqual(0);
      expect(queryObj.offset).toBeLessThanOrEqual(30);
      expect(['price_asc', 'relevance']).toContain(queryObj.sort);
    });

    test('should return dynamic query with offset and sort for casa', () => {
      const queryObj = getDynamicSearchQuery('casa');
      expect(queryObj.offset).toBeGreaterThanOrEqual(0);
      expect(queryObj.offset).toBeLessThanOrEqual(30);
    });
  });

  describe('Strict Real Coupon Extraction', () => {
    test('should extract real coupon from sale_terms', () => {
      const mockItem = {
        sale_terms: [{ id: 'COUPON_CODE', value_name: 'MELI10' }]
      };
      const result = extractRealCouponData(mockItem);
      expect(result.has_coupon).toBe(true);
      expect(result.coupon_code).toBe('MELI10');
    });

    test('should extract real coupon from tags', () => {
      const mockItem = {
        tags: ['full', 'coupon:TECH30']
      };
      const result = extractRealCouponData(mockItem);
      expect(result.has_coupon).toBe(true);
      expect(result.coupon_code).toBe('TECH30');
    });

    test('should return null when no coupon is present and NEVER invent one', () => {
      const mockItem = {
        id: 'MLB123456',
        title: 'Mouse Gamer',
        tags: ['shipping_free']
      };
      const result = extractRealCouponData(mockItem);
      expect(result.has_coupon).toBe(false);
      expect(result.coupon_code).toBeNull();
    });
  });

  describe('Post Formatting & Copywriting Rules', () => {
    const mockProductWithoutCoupon = {
      id: 'MLB999',
      title: 'Air Fryer Mondial 4L Inox',
      price: 299.90,
      old_price: 499.90,
      discount_percent: 40,
      link: 'https://meli.la/test123'
    };

    const mockProductWithRealCoupon = {
      id: 'MLB888',
      title: 'Placa de Vídeo RTX 4060 8GB',
      price: 1899.00,
      old_price: 2399.00,
      discount_percent: 20,
      link: 'https://meli.la/rtx4060',
      coupon: 'NV100',
      coupon_min_value: 1500
    };

    test('should omit coupon line when product does not have real coupon', () => {
      const casaProfile = getNicheProfile('casa');
      const couponData = { has_coupon: false, coupon_code: null };
      const result = formatDeterministicPost(mockProductWithoutCoupon, casaProfile, couponData);

      expect(result.status).toBe('APPROVED');
      expect(result.has_real_coupon).toBe(false);
      expect(result.formatted_message).not.toContain('Use o cupom');
      expect(result.formatted_message).not.toContain('🎟️');
      expect(OPENING_EMOJIS.some(e => result.formatted_message.startsWith(e))).toBe(true);
    });

    test('should include coupon and minimum value when product has real coupon', () => {
      const pcProfile = getNicheProfile('pc_gamer');
      const couponData = { has_coupon: true, coupon_code: 'NV100', coupon_min_value: 1500 };
      const result = formatDeterministicPost(mockProductWithRealCoupon, pcProfile, couponData);

      expect(result.status).toBe('APPROVED');
      expect(result.has_real_coupon).toBe(true);
      expect(result.formatted_message).toContain('🎟️ Use o cupom no anúncio: *NV100* (compras acima de R$ 1500)');
    });

    test('evaluateAndFormatProduct should reject products below minimum discount without coupon', async () => {
      const lowDiscountProduct = {
        title: 'Fogão 4 Bocas',
        price: 950,
        old_price: 1000,
        discount_percent: 5 // Casa requires 15%
      };
      const result = await evaluateAndFormatProduct(lowDiscountProduct, 'casa');
      expect(result.status).toBe('REJECTED');
      expect(result.reason).toContain('abaixo do mínimo exigido');
    });
  });
});
