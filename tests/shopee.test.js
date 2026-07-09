const axios = require('axios');
const shopeeService = require('../src/services/shopee.service');
const formatterService = require('../src/services/formatter.service');
const env = require('../src/config/env');

jest.mock('axios');

describe('Shopee Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.useShopee = true;
    env.shopeeAppId = 'mock_app_id';
    env.shopeeSecret = 'mock_secret';
  });

  test('searchProducts should return empty list if Shopee is disabled', async () => {
    env.useShopee = false;
    const products = await shopeeService.searchProducts('geladeira');
    expect(products).toEqual([]);
  });

  test('searchProducts should return empty list if appId or secret is missing', async () => {
    env.shopeeAppId = '';
    const products = await shopeeService.searchProducts('geladeira');
    expect(products).toEqual([]);
  });

  test('searchProducts should query GraphQL and map nodes correctly', async () => {
    const mockGraphQLResponse = {
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: '12345',
                shopId: '67890',
                productName: 'Jogo de Panelas Antiaderente',
                productLink: 'https://shopee.com.br/product/67890/12345',
                imageUrl: 'https://cf.shopee.com.br/file/img_123',
                price: 150.00,
                priceMin: 200.00,
                priceMax: 200.00,
                priceDiscountRate: '25%',
                sales: 250,
                ratingStar: 4.8
              }
            ]
          }
        }
      }
    };

    axios.post.mockResolvedValueOnce(mockGraphQLResponse);

    const products = await shopeeService.searchProducts('panelas');
    expect(products.length).toBe(1);
    expect(products[0]).toEqual({
      id: 'SP-12345',
      title: 'Jogo de Panelas Antiaderente',
      price: 150.00,
      oldPrice: 200.00,
      discountPercent: 25,
      link: 'https://shopee.com.br/product/67890/12345',
      imageUrl: 'https://cf.shopee.com.br/file/img_123',
      description: 'Oferta (Shopee): panelas',
      rating: 4.8,
      reviewsCount: 250,
      qualityScore: 180
    });
  });

  test('searchProducts should filter out blacklisted niche products', async () => {
    const mockGraphQLResponse = {
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: '33333',
                shopId: '44444',
                productName: 'Parafusadeira Elétrica Profissional', // blacklisted word 'parafusadeira'
                productLink: 'https://shopee.com.br/product/44444/33333',
                imageUrl: 'https://cf.shopee.com.br/file/img_333',
                price: 120.00,
                priceMin: 180.00,
                priceDiscountRate: '33%',
                sales: 500,
                ratingStar: 4.9
              }
            ]
          }
        }
      }
    };

    axios.post.mockResolvedValueOnce(mockGraphQLResponse);

    const products = await shopeeService.searchProducts('parafusadeira');
    expect(products.length).toBe(0);
  });
});

describe('Formatter Service - Shopee', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.shopeeAppId = 'mock_app_id';
    env.shopeeSecret = 'mock_secret';
    env.shopeeAffiliateTag = 'mock_tag';
  });

  test('formatLink should call Shopee GraphQL generateShortLink mutation', async () => {
    const mockGraphQLResponse = {
      data: {
        data: {
          generateShortLink: {
            shortLink: 'https://shope.ee/xyz123'
          }
        }
      }
    };

    axios.post.mockResolvedValueOnce(mockGraphQLResponse);

    const link = await formatterService.formatLink('https://shopee.com.br/product/67890/12345');
    expect(link).toBe('https://shope.ee/xyz123');
  });

  test('formatLink should fall back to UTM parameters and generic shortener if API fails', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      axios.post.mockRejectedValueOnce(new Error('Network error'));
      axios.get.mockResolvedValueOnce({ data: 'https://tinyurl.com/mock-shortened' });

      const link = await formatterService.formatLink('https://shopee.com.br/product/67890/12345');
      expect(link).toBe('https://tinyurl.com/mock-shortened');
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('https://tinyurl.com/api-create.php?url=https%3A%2F%2Fshopee.com.br%2Fproduct%2F67890%2F12345%3Futm_campaign%3D-%26utm_content%3D-%26utm_medium%3Daffiliates%26utm_source%3Dan_spp%26utm_term%3Dmock_tag'),
        expect.any(Object)
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('generateFormattedMessage should format Shopee templates correctly', async () => {
    const shopeeProduct = {
      id: 'SP-12345',
      title: 'Jogo de Panelas',
      price: 150.00,
      oldPrice: 200.00,
      discountPercent: 25,
      link: 'https://shope.ee/xyz123',
      coupon: 'SHOPEE20'
    };

    const msg = await formatterService.generateFormattedMessage(shopeeProduct, shopeeProduct.link);
    const shopeeHeaders = [
      'ACHADO DO DIA SHOPEE 🧡',
      'PROMOÇÃO EXCLUSIVA SHOPEE 🔥',
      'SÓ HOJE NA SHOPEE ⚡',
      'OLHA ESSE PRECINHO NA SHOPEE! 👀',
      'DESCONTO ARRASADOR SHOPEE 💥',
      'SHOPEE ARRASA 🧡',
      'OFERTA IMPERDÍVEL SHOPEE 🔥',
      'PREÇO BAIXO DE VERDADE SHOPEE 💸',
      'CORRE QUE VAI ACABAR! 🏃‍♂️💨',
      'ACHADO IMPERDÍVEL SHOPEE 💎'
    ];

    const hasShopeeHeader = shopeeHeaders.some(h => msg.includes(h));
    expect(hasShopeeHeader).toBe(true);
    expect(msg).toContain('Jogo de Panelas');
    expect(msg).toContain('De ~R$ 200,00~');
    expect(msg).toContain('💵 Por R$ 150,00');
    expect(msg).toContain('😱 25% OFF');
    expect(msg).toContain('🎟️ Use o Cupom: *SHOPEE20*');
    expect(msg).toContain('Compre aqui:');
    expect(msg).toContain('https://shope.ee/xyz123');
  });
});
