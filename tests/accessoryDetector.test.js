const { isDeceptiveAccessory } = require('../src/helpers/accessoryDetector');

describe('AccessoryDetector - Anti-Deceptive Filter', () => {
  test('deve detectar e bloquear suportes plásticos e bases de controle', () => {
    const item = {
      title: 'Suporte Duplo Para Controles De Ps5 Ps4 Porta Base Dualsense',
      price: 22.90
    };
    expect(isDeceptiveAccessory(item)).toBe(true);
  });

  test('deve detectar e bloquear capinhas e películas de smartphones', () => {
    const capaIphone = {
      title: 'Capa Case Transparente Para iPhone 16 Pro Max Anti Queda',
      price: 29.90
    };
    expect(isDeceptiveAccessory(capaIphone)).toBe(true);

    const peliculaGalaxy = {
      title: 'Película De Vidro 3D Para Samsung Galaxy S25 Ultra',
      price: 19.90
    };
    expect(isDeceptiveAccessory(peliculaGalaxy)).toBe(true);
  });

  test('deve detectar e bloquear suportes de TV e skins de console', () => {
    const suporteTv = {
      title: 'Suporte Articulado De Parede Para Smart TV 32 A 55 Polegadas',
      price: 49.90
    };
    expect(isDeceptiveAccessory(suporteTv)).toBe(true);

    const skinPs5 = {
      title: 'Skin Adesivo Para Console PlayStation 5 Slim Black Edition',
      price: 39.90
    };
    expect(isDeceptiveAccessory(skinPs5)).toBe(true);
  });

  test('deve permitir produtos legítimos de alto valor e hardware real', () => {
    const realDualsense = {
      title: 'Controle Sem Fio DualSense PS5 Midnight Black',
      price: 399.00
    };
    expect(isDeceptiveAccessory(realDualsense)).toBe(false);

    const realPs5 = {
      title: 'Console PlayStation 5 Slim 1TB Edição Digital',
      price: 3499.00
    };
    expect(isDeceptiveAccessory(realPs5)).toBe(false);

    const realS25 = {
      title: 'Smartphone Samsung Galaxy S25 Ultra 512GB 5G Titânio',
      price: 6999.00
    };
    expect(isDeceptiveAccessory(realS25)).toBe(false);

    const realIphone = {
      title: 'Apple iPhone 16 Pro 256GB Titânio Preto',
      price: 8499.00
    };
    expect(isDeceptiveAccessory(realIphone)).toBe(false);

    const realTv = {
      title: 'Smart TV 55 4K UHD Samsung Neo QLED 120Hz',
      price: 2899.00
    };
    expect(isDeceptiveAccessory(realTv)).toBe(false);

    const realGabinete = {
      title: 'Gabinete Gamer Aquario Rise Mode Galaxy Glass',
      price: 289.00
    };
    expect(isDeceptiveAccessory(realGabinete)).toBe(false);
  });
});

