const { 
  isProductBlacklisted, 
  getCategoryForKeyword, 
  validarQualidadeProduto 
} = require('../src/services/mercadoLivre.service');

describe('Mercado Livre Service Filtering & Categorization', () => {
  describe('isProductBlacklisted', () => {
    test('should NOT blacklist allowed niche home items containing "roupa" or "ferramenta"', () => {
      expect(isProductBlacklisted('Guarda-Roupa Casal com Espelho')).toBe(false);
      expect(isProductBlacklisted('Cesto de roupas sujas dobrável')).toBe(false);
      expect(isProductBlacklisted('Cesto de roupa organizador')).toBe(false);
      expect(isProductBlacklisted('Caixa de ferramentas completa 129 peças')).toBe(false);
      expect(isProductBlacklisted('Varal de roupas retrátil de parede')).toBe(false);
      expect(isProductBlacklisted('Jogo de Cabides para Roupa')).toBe(false);
    });

    test('should blacklist generic clothing, shoes and car parts', () => {
      expect(isProductBlacklisted('Camiseta preta masculina')).toBe(true);
      expect(isProductBlacklisted('Calça jeans slim')).toBe(true);
      expect(isProductBlacklisted('Tênis de corrida running')).toBe(true);
      expect(isProductBlacklisted('Pneu aro 14 pirelli')).toBe(true);
      expect(isProductBlacklisted('Chave de fenda magnetica')).toBe(true);
      expect(isProductBlacklisted('Martelete perfurador profissional')).toBe(true);
      expect(isProductBlacklisted('Aquecedor De Água Elétrico Lorenzetti')).toBe(true);
      expect(isProductBlacklisted('Chuveiro Multitemperaturas')).toBe(true);
      expect(isProductBlacklisted('Torneira Monocomando')).toBe(true);
    });

    test('should blacklist other unrelated items', () => {
      expect(isProductBlacklisted('Whey protein concentrado')).toBe(true);
      expect(isProductBlacklisted('Creatina monohidratada')).toBe(true);
    });

    test('should not blacklist regular kitchen or home items', () => {
      expect(isProductBlacklisted('Jogo de Panelas Antiaderente')).toBe(false);
      expect(isProductBlacklisted('Liquidificador Mondial Turbo')).toBe(false);
      expect(isProductBlacklisted('Smart TV LED 50 polegadas')).toBe(false);
      expect(isProductBlacklisted('Sofá 3 lugares retrátil')).toBe(false);
    });
  });

  describe('getCategoryForKeyword', () => {
    test('should route appliances to MLB5726', () => {
      expect(getCategoryForKeyword('air fryer')).toBe('MLB5726');
      expect(getCategoryForKeyword('geladeira duplex')).toBe('MLB5726');
      expect(getCategoryForKeyword('fogão cooktop')).toBe('MLB5726');
      expect(getCategoryForKeyword('micro-ondas')).toBe('MLB5726');
      expect(getCategoryForKeyword('máquina de lavar')).toBe('MLB5726');
      expect(getCategoryForKeyword('chaleira elétrica')).toBe('MLB5726');
      expect(getCategoryForKeyword('smart tv')).toBe('MLB5726');
    });

    test('should route furniture and decor items to MLB1574', () => {
      expect(getCategoryForKeyword('jogo de panelas')).toBe('MLB1574');
      expect(getCategoryForKeyword('sofá retrátil')).toBe('MLB1574');
      expect(getCategoryForKeyword('mesa de cabeceira')).toBe('MLB1574');
      expect(getCategoryForKeyword('espelho decorativo')).toBe('MLB1574');
    });
  });

  describe('validarQualidadeProduto (Filtro Avançado de Reputação e Qualidade)', () => {
    const baseValidProduct = {
      id: 'MLB123456789',
      title: 'Fritadeira Sem Óleo Air Fryer Mondial 4L',
      price: 299.90,
      oldPrice: 399.90,
      discountPercent: 25,
      rating: 4.8,
      reviewsCount: 350,
      isOfficialStore: true,
      isFull: true,
      hasDiscount: true,
      link: 'https://produto.mercadolivre.com.br/MLB-123456789-air-fryer'
    };

    test('deve aprovar produto que cumpre TODOS os critérios rigorosos', () => {
      expect(validarQualidadeProduto(baseValidProduct)).toBe(true);
    });

    test('deve rejeitar produto nulo ou indefinido', () => {
      expect(validarQualidadeProduto(null)).toBe(false);
      expect(validarQualidadeProduto(undefined)).toBe(false);
      expect(validarQualidadeProduto({})).toBe(false);
    });

    test('deve rejeitar produto com menos de 100 avaliações de compradores', () => {
      const productFewReviews = { ...baseValidProduct, reviewsCount: 99 };
      expect(validarQualidadeProduto(productFewReviews)).toBe(false);

      const productZeroReviews = { ...baseValidProduct, reviewsCount: 0 };
      expect(validarQualidadeProduto(productZeroReviews)).toBe(false);

      const productExactly100Reviews = { ...baseValidProduct, reviewsCount: 100 };
      expect(validarQualidadeProduto(productExactly100Reviews)).toBe(true);
    });

    test('deve rejeitar produto com nota média inferior a 4.5 estrelas', () => {
      const productLowRating = { ...baseValidProduct, rating: 4.4 };
      expect(validarQualidadeProduto(productLowRating)).toBe(false);

      const productRating4 = { ...baseValidProduct, rating: 4.0 };
      expect(validarQualidadeProduto(productRating4)).toBe(false);

      const productExactly45 = { ...baseValidProduct, rating: 4.5 };
      expect(validarQualidadeProduto(productExactly45)).toBe(true);
    });

    test('deve rejeitar produto no preço cheio padrão sem desconto ou promoção ativa', () => {
      const productNoDiscount = { 
        ...baseValidProduct, 
        oldPrice: null, 
        discountPercent: 0, 
        hasDiscount: false, 
        hasPromotionBadge: false, 
        promotionBadge: null, 
        coupon: null 
      };
      expect(validarQualidadeProduto(productNoDiscount)).toBe(false);
    });

    test('deve aprovar produto com desconto percentual >= 5%', () => {
      const product5PercentDiscount = { 
        ...baseValidProduct, 
        discountPercent: 5,
        hasDiscount: true
      };
      expect(validarQualidadeProduto(product5PercentDiscount)).toBe(true);

      const product4PercentDiscount = { 
        ...baseValidProduct, 
        discountPercent: 4,
        hasDiscount: false,
        hasPromotionBadge: false,
        coupon: null
      };
      expect(validarQualidadeProduto(product4PercentDiscount)).toBe(false);
    });

    test('deve aprovar produto com selo de promoção ativo (Oferta do Dia / Relâmpago) mesmo com desconto numérico ausente', () => {
      const productWithPromoBadge = { 
        ...baseValidProduct, 
        discountPercent: 0,
        hasPromotionBadge: true,
        promotionBadge: 'OFERTA DO DIA'
      };
      expect(validarQualidadeProduto(productWithPromoBadge)).toBe(true);
    });

    test('deve aprovar produto com cupom ativo mesmo sem desconto no preço de tabela', () => {
      const productWithCoupon = { 
        ...baseValidProduct, 
        discountPercent: 0,
        coupon: 'CUPOM10OFF'
      };
      expect(validarQualidadeProduto(productWithCoupon)).toBe(true);
    });

    test('deve rejeitar vendedor sem reputação comprovada', () => {
      const productNoReputation = { 
        ...baseValidProduct, 
        isOfficialStore: false, 
        isMercadoLider: false, 
        hasGreenReputation: false, 
        isFull: false,
        sellerInfo: 'Vendedor Iniciante',
        sellerReputation: 'Standard'
      };
      expect(validarQualidadeProduto(productNoReputation)).toBe(false);
    });

    test('deve aprovar vendedores com MercadoLíder, Full ou Termômetro Verde', () => {
      const productMercadoLider = { 
        ...baseValidProduct, 
        isOfficialStore: false, 
        isMercadoLider: true, 
        isFull: false 
      };
      expect(validarQualidadeProduto(productMercadoLider)).toBe(true);

      const productFull = { 
        ...baseValidProduct, 
        isOfficialStore: false, 
        isMercadoLider: false, 
        isFull: true 
      };
      expect(validarQualidadeProduto(productFull)).toBe(true);

      const productGreenRep = { 
        ...baseValidProduct, 
        isOfficialStore: false, 
        isMercadoLider: false, 
        hasGreenReputation: true, 
        isFull: false 
      };
      expect(validarQualidadeProduto(productGreenRep)).toBe(true);
    });

    test('deve permitir customização de limiares por parâmetro', () => {
      const customProduct = {
        ...baseValidProduct,
        reviewsCount: 60,
        rating: 4.2,
        discountPercent: 3
      };

      // No modo padrão (100 reviews, 4.5 estrelas, 5% desconto) deve falhar:
      expect(validarQualidadeProduto(customProduct)).toBe(false);

      // Com limiares customizados (50 reviews, 4.0 estrelas, 2% desconto) deve passar:
      expect(validarQualidadeProduto(customProduct, {
        minReviews: 50,
        minRating: 4.0,
        minDiscountPercent: 2
      })).toBe(true);
    });
  });
});

