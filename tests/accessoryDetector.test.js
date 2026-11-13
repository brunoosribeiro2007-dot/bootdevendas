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

    const peliculaIphone = {
      title: 'Kit 2 Películas Cerâmica Fosca Premium Para iPhone',
      price: 26.13
    };
    expect(isDeceptiveAccessory(peliculaIphone)).toBe(true);
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

  test('deve detectar e bloquear dissipadores/thermal pads que se passam por memória RAM', () => {
    const dissipadorRam = {
      title: 'Dissipador De Memória Ram Ddr3/ddr4/ddr5 + Thermal Pad',
      price: 37.87
    };
    expect(isDeceptiveAccessory(dissipadorRam)).toBe(true);
  });

  test('deve detectar e bloquear acessórios automotivos (tapete ford pampa, assoalho)', () => {
    const tapetePampa = {
      title: 'Tapete Carpete Assoalho Couro Sintético Ford Pampa',
      price: 96.00
    };
    expect(isDeceptiveAccessory(tapetePampa)).toBe(true);
  });

  test('deve detectar e bloquear mini caixinhas de som 3W de baixa qualidade', () => {
    const miniCaixinha = {
      title: 'Mini Caixinha De Som 2.0 Para Pc Notebook 3w Usb P2',
      price: 36.89
    };
    expect(isDeceptiveAccessory(miniCaixinha)).toBe(true);
  });

  test('deve detectar e bloquear microfones de jornalismo/reportagem/repórter genéricos', () => {
    const micJornalismo = {
      title: 'Kit Microfone P/ Câmeras Dslr, Jornalismo, Reportagem, Lives',
      price: 140.00
    };
    expect(isDeceptiveAccessory(micJornalismo)).toBe(true);

    const micReporter = {
      title: 'Kit Repórter Microfone No Celular Live Gravações Entrevista',
      price: 94.86
    };
    expect(isDeceptiveAccessory(micReporter)).toBe(true);
  });

  test('deve permitir microfones gamer e de streaming de marcas conceituadas (Fifine, HyperX)', () => {
    const fifineMic = {
      title: 'Microfone Gamer Fifine AmpliGame A6V USB Condensador RGB',
      price: 199.00
    };
    expect(isDeceptiveAccessory(fifineMic)).toBe(false);

    const hyperxMic = {
      title: 'Microfone HyperX SoloCast USB Preto para Streamer',
      price: 299.00
    };
    expect(isDeceptiveAccessory(hyperxMic)).toBe(false);
  });

  test('deve permitir caixas de som de qualidade (JBL, Edifier)', () => {
    const jblFlip = {
      title: 'Caixa de Som Bluetooth JBL Flip 6 30W RMS À Prova D’Água',
      price: 599.00
    };
    expect(isDeceptiveAccessory(jblFlip)).toBe(false);

    const jblGo = {
      title: 'Caixa De Som Bluetooth Jbl Go 4 Portatil 4.2w Rms',
      price: 249.00
    };
    expect(isDeceptiveAccessory(jblGo)).toBe(false);
  });

  test('deve permitir memória RAM legítima de marca conceituada', () => {
    const ramReal = {
      title: 'Memória RAM Corsair Vengeance LPX 16GB (2x8GB) DDR4 3200MHz',
      price: 269.00
    };
    expect(isDeceptiveAccessory(ramReal)).toBe(false);
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

