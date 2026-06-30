const { isProductBlacklisted, getCategoryForKeyword } = require('../src/services/mercadoLivre.service');

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
});
