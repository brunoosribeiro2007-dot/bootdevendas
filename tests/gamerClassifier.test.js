const gamerClassifier = require('../src/services/gamerClassifier.service');

describe('GamerClassifierService - Hardware & Peripheral Categorization', () => {
  describe('1. GPU Classification & Parsing', () => {
    test('should classify Nvidia RTX GPUs and extract specifications', () => {
      const rtx4060 = gamerClassifier.classify('Placa de Vídeo RTX 4060 8GB GDDR6 MSI Ventus');
      expect(rtx4060.category).toBe('GPUs');
      expect(rtx4060.subCategory).toBe('RTX 40 Series');
      expect(rtx4060.specs.vram).toBe('8GB GDDR6');
      expect(rtx4060.appealScore).toBeGreaterThanOrEqual(80);

      const rtx3060 = gamerClassifier.classify('Placa de Vídeo Galax GeForce RTX 3060 12GB GDDR6');
      expect(rtx3060.category).toBe('GPUs');
      expect(rtx3060.subCategory).toBe('RTX 30 Series');
      expect(rtx3060.specs.vram).toBe('12GB GDDR6');

      const rtx4070 = gamerClassifier.classify('Placa de Vídeo ASUS TUF Gaming RTX 4070 Ti Super 16GB GDDR6X');
      expect(rtx4070.category).toBe('GPUs');
      expect(rtx4070.specs.vram).toBe('16GB GDDR6X');
    });

    test('should classify AMD Radeon and Intel Arc GPUs', () => {
      const rx6600 = gamerClassifier.classify('Placa de Vídeo ASRock AMD Radeon RX 6600 Challenger D 8GB');
      expect(rx6600.category).toBe('GPUs');
      expect(rx6600.subCategory).toBe('Radeon RX 6000');
      expect(rx6600.appealScore).toBeGreaterThanOrEqual(80);

      const rx7600 = gamerClassifier.classify('Placa de Vídeo Sapphire Pulse AMD Radeon RX 7600 Gaming 8GB');
      expect(rx7600.category).toBe('GPUs');
      expect(rx7600.subCategory).toBe('Radeon RX 7000/9000');

      const arcA750 = gamerClassifier.classify('Placa de Vídeo Intel Arc A750 Challenger D 8GB OC');
      expect(arcA750.category).toBe('GPUs');
      expect(arcA750.subCategory).toBe('Intel Arc');
    });
  });

  describe('2. CPUs & Upgrade Kits Classification', () => {
    test('should classify AMD Ryzen and highlight high-appeal X3D models', () => {
      const r5700x3d = gamerClassifier.classify('Processador AMD Ryzen 7 5700X3D 4.1GHz 96MB AM4');
      expect(r5700x3d.category).toBe('CPUs & Kits');
      expect(r5700x3d.tier).toBe('Top Gamer');
      expect(r5700x3d.appealScore).toBeGreaterThanOrEqual(85);

      const r5600 = gamerClassifier.classify('Processador AMD Ryzen 5 5600 3.5GHz AM4 com Cooler Wraith');
      expect(r5600.category).toBe('CPUs & Kits');
      expect(r5600.subCategory).toBe('Ryzen 5000 Series');

      const r7800x3d = gamerClassifier.classify('Processador AMD Ryzen 7 7800X3D 5.0GHz 96MB AM5');
      expect(r7800x3d.category).toBe('CPUs & Kits');
      expect(r7800x3d.appealBadge).toContain('DESTAQUE');
    });

    test('should classify Intel Core Processors', () => {
      const i512400f = gamerClassifier.classify('Processador Intel Core i5-12400F 2.5GHz LGA 1700');
      expect(i512400f.category).toBe('CPUs & Kits');
      expect(i512400f.subCategory).toBe('Intel Core 12th-14th');

      const i513600k = gamerClassifier.classify('Processador Intel Core i5-13600K 3.5GHz LGA1700');
      expect(i513600k.category).toBe('CPUs & Kits');
    });

    test('should classify Kit Upgrade with maximum appeal', () => {
      const kit = gamerClassifier.classify('Kit Upgrade Ryzen 5 5600 + Placa Mãe B550M + 16GB DDR4 3200MHz');
      expect(kit.category).toBe('CPUs & Kits');
      expect(kit.subCategory).toBe('Kit Upgrade');
      expect(kit.appealScore).toBeGreaterThanOrEqual(85);
    });
  });

  describe('3. Monitores Gamer Classification', () => {
    test('should classify gaming monitors and extract refresh rate, panel, and resolution', () => {
      const monitorIps = gamerClassifier.classify('Monitor Gamer AOC Hero 24 Pol 144Hz 1ms IPS Full HD FreeSync');
      expect(monitorIps.category).toBe('Monitores');
      expect(monitorIps.specs.refreshRate).toBe('144Hz');
      expect(monitorIps.specs.panel).toBe('IPS');
      expect(monitorIps.specs.screenSize).toBe('24"');
      expect(monitorIps.specs.responseTime).toBe('1ms');
      expect(monitorIps.specs.resolution).toBe('Full HD (1080p)');

      const monitor240hz = gamerClassifier.classify('Monitor Gamer LG UltraGear 27 Pol 240Hz 1ms Fast IPS QHD G-Sync');
      expect(monitor240hz.category).toBe('Monitores');
      expect(monitor240hz.specs.refreshRate).toBe('240Hz');
      expect(monitor240hz.specs.panel).toBe('FAST IPS');
      expect(monitor240hz.specs.resolution).toBe('QHD (1440p)');
      expect(monitor240hz.appealScore).toBeGreaterThanOrEqual(85);
    });
  });

  describe('4. Peripherals & Value Deals Classification', () => {
    test('should classify mechanical keyboards and extract switch type', () => {
      const kb = gamerClassifier.classify('Teclado Mecânico Gamer Redragon Kumara Switch Red RGB');
      expect(kb.category).toBe('Periféricos & Custo-Benefício');
      expect(kb.subCategory).toBe('Teclado Mecânico');
      expect(kb.brand).toBe('Redragon');
      expect(kb.specs.switch).toBe('RED');
    });

    test('should classify gaming mice and sensors', () => {
      const mouse = gamerClassifier.classify('Mouse Gamer Attack Shark X3 Sem Fio Sensor PAW 3395 26000 DPI');
      expect(mouse.category).toBe('Periféricos & Custo-Benefício');
      expect(mouse.subCategory).toBe('Mouse Gamer');
      expect(mouse.specs.sensor).toBe('PAW 3395');
    });

    test('should classify headsets from recognized brands', () => {
      const headset = gamerClassifier.classify('Headset Gamer HyperX Cloud Stinger 2 Som Espacial P3');
      expect(headset.category).toBe('Periféricos & Custo-Benefício');
      expect(headset.subCategory).toBe('Headset Gamer');
      expect(headset.brand).toBe('Hyperx');
    });
  });

  describe('5. Consoles, Gabinetes, Smartphones & Smart TVs Classification', () => {
    test('should classify PS5 console and DualSense controllers', () => {
      const ps5 = gamerClassifier.classify('Console PlayStation 5 Slim 1TB Edição Digital');
      expect(ps5.category).toBe('Consoles & Games');
      expect(ps5.isGamer).toBe(true);
      expect(ps5.appealScore).toBeGreaterThanOrEqual(80);

      const dualsense = gamerClassifier.classify('Controle Sem Fio DualSense PS5 Midnight Black');
      expect(dualsense.category).toBe('Consoles & Games');
      expect(dualsense.isGamer).toBe(true);
    });

    test('should classify high-performance smartphones (Galaxy S25, iPhone)', () => {
      const s25 = gamerClassifier.classify('Smartphone Samsung Galaxy S25 Ultra 512GB 5G Titânio');
      expect(s25.category).toBe('Smartphones & Tech');
      expect(s25.isGamer).toBe(true);

      const iphone = gamerClassifier.classify('Apple iPhone 16 Pro 256GB Titânio Preto');
      expect(iphone.category).toBe('Smartphones & Tech');
      expect(iphone.isGamer).toBe(true);
    });

    test('should classify Smart TVs and Gaming Cases (Gabinetes)', () => {
      const tv = gamerClassifier.classify('Smart TV 55 4K UHD Samsung Neo QLED 120Hz');
      expect(tv.category).toBe('Smart TVs & Telas');
      expect(tv.isGamer).toBe(true);

      const gabinete = gamerClassifier.classify('Gabinete Gamer Aquario Rise Mode Galaxy Glass');
      expect(gabinete.category).toBe('Hardware & Refrigeração');
      expect(gabinete.subCategory).toBe('Gabinete Gamer');
      expect(gabinete.isGamer).toBe(true);
    });
  });
});
