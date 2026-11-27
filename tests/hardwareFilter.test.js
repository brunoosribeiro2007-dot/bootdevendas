const { isObsoleteHardware, isProductMatchingNiche } = require('../src/helpers/hardwareFilter');

describe('Hardware Filter & Niche Isolation', () => {
  describe('isObsoleteHardware', () => {
    test('should reject obsolete motherboards and chipsets', () => {
      const obsoleteBoards = [
        'Placa Mãe B75 Lga 1155 Chip Tpm 2.0 Incluso Gigalan Win 11',
        'Placa Mae H61 Ddr3 Lga 1155 Intel Core I3 I5 I7',
        'Placa Mãe H81 Lga 1150 Ddr3 Suporta I3 I5 I7 4ª Geração',
        'Kit Upgrade Intel Core I7 4770 H81 Cooler',
        'Placa Mãe X99 Lga 2011-3 Ddr4 Quad Channel Xeon E5',
        'Placa Mãe X79 Lga 2011 Ddr3 M.2 Nvme',
        'Placa Mãe G41 Lga 775 Ddr3 8gb Core 2 Duo'
      ];

      for (const title of obsoleteBoards) {
        expect(isObsoleteHardware({ title, price: 300 })).toBe(true);
      }
    });

    test('should reject obsolete GPUs', () => {
      const obsoleteGpus = [
        'Placa De Vídeo Gamer Delta Rx 580 Mkii 8gb Gddr5 256 Bits',
        'Amd Soyo Mougol Radeon Rx580 Radeon Rx 580 8gb Black Edition',
        'Placa De Vídeo Soyo Amd Radeon Rx580 8gb 256bit Gddr5 Game',
        'Placa De Video Amd Rx580 Snow 8gb 256bits Gddr5 Hdmi Gamer',
        'Placa de Vídeo Geforce GT 710 2GB DDR3',
        'Placa de Vídeo Geforce GT 730 4GB',
        'Placa de Vídeo Geforce GTX 750 Ti 2GB GDDR5',
        'Placa de Vídeo Radeon RX 550 4GB GDDR5'
      ];

      for (const title of obsoleteGpus) {
        expect(isObsoleteHardware({ title, price: 600 })).toBe(true);
      }
    });

    test('should reject obsolete CPUs', () => {
      const obsoleteCpus = [
        'Processador Intel Core I3-7100 3.9ghz 2 Núcleos Hd Graphics',
        'Processador Intel Core I7-3770 Lga 1155 4 Núcleos 8 Threads',
        'Processador Intel Core i5-3470 3.2GHz Quad Core',
        'Processador Amd Fx-6300 3.5ghz 6 Núcleos Am3+',
        'Processador Core 2 Quad Q6600 Lga 775',
        'Pc Gamer Intel Core I7 3770 16gb Ram Ssd480gb Preto Bivolt'
      ];

      for (const title of obsoleteCpus) {
        expect(isObsoleteHardware({ title, price: 200 })).toBe(true);
      }
    });

    test('should reject obsolete RAM and tiny storage', () => {
      const obsoleteRamAndStorage = [
        'Memória Ram Ddr4 4gb 2666mhz Dimm Pc Computador Desktop 1,2v',
        'Memória Ram 8gb Ddr3 1600mhz Kingston Kvr16n11/8',
        'Memória Servidor Micron 128gb Ddr5 8000 Rdimm 2rx4 Ec8',
        'Adaptadormemória Ram Ddr4 Notebook So-dimm Para Dimm Jet5608',
        'Ssd 128gb Rise Mode Z Series Sata Original',
        'Hd Ssd 120gb Sata 2.5 Interno Leitura Mais Rapida Original'
      ];

      for (const title of obsoleteRamAndStorage) {
        expect(isObsoleteHardware({ title, price: 150 })).toBe(true);
      }
    });

    test('should accept modern, high-appeal hardware', () => {
      const modernHardware = [
        'Placa De Vídeo Galax Nvidia GeForce RTX 4060 1-Click OC 8GB GDDR6',
        'Placa De Vídeo ASRock AMD Radeon RX 6600 Challenger D 8GB GDDR6',
        'Placa De Vídeo Sapphire Pulse AMD Radeon RX 7600 8GB GDDR6',
        'Processador AMD Ryzen 5 5600 3.5GHz (4.4GHz Turbo) AM4',
        'Processador AMD Ryzen 7 5700X3D 3.0GHz 8-Core AM4',
        'Processador Intel Core i5-12400F 2.5GHz LGA 1700',
        'Placa Mãe MSI B550M Pro-VDH WiFi AMD AM4 DDR4',
        'Placa Mãe Asus TUF Gaming B650M-PLUS AMD AM5 DDR5',
        'Memória RAM Kingston Fury Beast 16GB (2x8GB) 3200MHz DDR4 CL16',
        'SSD Kingston NV2 1TB M.2 2280 PCIe 4.0 NVMe 3500MB/s'
      ];

      for (const title of modernHardware) {
        expect(isObsoleteHardware({ title, price: 1000 })).toBe(false);
      }
    });
  });

  describe('isProductMatchingNiche', () => {
    test('should reject PC gamer/tech products from Casa niche', () => {
      const techProducts = [
        'Placa Mãe Asus Tuf Gaming B550m Plus B550 Amd Am4',
        'Placa de Vídeo RTX 4060 8GB GDDR6',
        'Processador AMD Ryzen 5 5600 AM4',
        'Memoria Ram DDR4 16GB 3200MHz',
        'Gabinete Gamer Aquario Rise Mode',
        'Water Cooler 240mm ARGB',
        'Teclado Mecânico Gamer Switch Red'
      ];

      for (const title of techProducts) {
        expect(isProductMatchingNiche({ title }, 'casa')).toBe(false);
      }
    });

    test('should reject Casa products from PC Gamer niche', () => {
      const casaProducts = [
        'Fritadeira Sem Óleo Air Fryer Digital 4L Inox',
        'Jogo de Panelas Antiaderente Cerâmica 5 Peças',
        'Liquidificador Potente 1200W Philco',
        'Cooktop 4 Bocas Vidro Temperado Bivolt',
        'Aspirador de Pó Vertical 2 em 1 Sem Fio',
        'Edredom Casal Microfibra Toque Macio'
      ];

      for (const title of casaProducts) {
        expect(isProductMatchingNiche({ title }, 'pc_gamer')).toBe(false);
      }
    });

    test('should accept valid products for each niche', () => {
      expect(isProductMatchingNiche({ title: 'Fritadeira Air Fryer 4L' }, 'casa')).toBe(true);
      expect(isProductMatchingNiche({ title: 'Placa de Vídeo RTX 4060' }, 'pc_gamer')).toBe(true);
    });
  });
});
