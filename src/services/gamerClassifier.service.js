/**
 * Gamer Product Classifier & Parsing Engine
 * Classifica e extrai especificações técnicas de ofertas de computadores e hardware gamer.
 */

class GamerClassifierService {
  constructor() {
    this.CATEGORIES = {
      GPUS: 'GPUs',
      CPUS_KITS: 'CPUs & Kits',
      MONITORS: 'Monitores',
      PERIPHERALS_VALUE: 'Periféricos & Custo-Benefício',
      HARDWARE_CORE: 'Hardware & Refrigeração',
      OTHER_GAMER: 'Outros Gamer'
    };

    // Regex e padrões de GPU
    this.gpuPatterns = [
      // NVIDIA RTX 50 Series
      { regex: /\brtx\s*(5090|5080|5070\s*(?:ti)?)\b/i, series: 'RTX 50 Series', tier: 'High-End', vramDefault: '16GB' },
      // NVIDIA RTX 40 Series
      { regex: /\brtx\s*(4090|4080\s*(?:super)?|4070\s*(?:ti\s*super|ti|super)?|4060\s*(?:ti)?)\b/i, series: 'RTX 40 Series', tier: 'High-Demand' },
      // NVIDIA RTX 30 Series
      { regex: /\brtx\s*(3090\s*(?:ti)?|3080\s*(?:ti)?|3070\s*(?:ti)?|3060\s*(?:ti)?|3050)\b/i, series: 'RTX 30 Series', tier: 'Custo-Benefício' },
      // NVIDIA GTX Series
      { regex: /\bgtx\s*(1660\s*(?:ti|super)?|1650|1060|1050\s*(?:ti)?)\b/i, series: 'GTX Series', tier: 'Entrada' },
      // AMD Radeon RX 9000 / 7000 Series
      { regex: /\brx\s*(9070\s*(?:xt)?|7900\s*(?:xtx|xt|gre)|7800\s*xt|7700\s*xt|7600\s*(?:xt)?)\b/i, series: 'Radeon RX 7000/9000', tier: 'High-Demand' },
      // AMD Radeon RX 6000 Series
      { regex: /\brx\s*(6950\s*xt|6900\s*xt|6800\s*(?:xt)?|6750\s*xt|6700\s*(?:xt)?|6650\s*xt|6600\s*(?:xt)?|6500\s*xt|6400)\b/i, series: 'Radeon RX 6000', tier: 'Custo-Benefício' },
      // Intel Arc
      { regex: /\b(intel\s*arc\s*(?:a770|a750|a580|a380|b580|b570)|arc\s*a750|arc\s*a770|arc\s*b580)\b/i, series: 'Intel Arc', tier: 'Custo-Benefício' }
    ];

    // Regex e padrões de CPU & Kits
    this.cpuPatterns = [
      // AMD Ryzen X3D (Altíssimo apelo gamer)
      { regex: /\b(ryzen\s*[79]\s*(?:9800x3d|7800x3d|7950x3d|7900x3d|5700x3d|5800x3d))\b/i, series: 'Ryzen 3D V-Cache', tier: 'Top Gamer' },
      // AMD Ryzen 9000 Series
      { regex: /\b(ryzen\s*[579]\s*9\d{3}[a-z]*)\b/i, series: 'Ryzen 9000 Series', tier: 'High-End' },
      // AMD Ryzen 7000 Series
      { regex: /\b(ryzen\s*[579]\s*7\d{3}[a-z]*)\b/i, series: 'Ryzen 7000 Series', tier: 'High-Demand' },
      // AMD Ryzen 5000/4000/3000 Series
      { regex: /\b(ryzen\s*[357]\s*(?:5600x|5600gt|5600g|5600|5700x|5700g|5500|4500|3600))\b/i, series: 'Ryzen 5000 Series', tier: 'Custo-Benefício' },
      // Intel Core 14th/13th/12th Gen & Core Ultra
      { regex: /\b(core\s*ultra\s*[579]\s*\d+[a-z]*)\b/i, series: 'Intel Core Ultra', tier: 'High-End' },
      { regex: /\b(i[579][\s-](?:14\d{3}[a-z]*|13\d{3}[a-z]*|12\d{3}[a-z]*))\b/i, series: 'Intel Core 12th-14th', tier: 'High-Demand' },
      { regex: /\b(i3[\s-](?:14\d{3}[a-z]*|13\d{3}[a-z]*|12\d{3}[a-z]*))\b/i, series: 'Intel Core Entrada', tier: 'Entrada' }
    ];

    // Marcas de Periféricos Reconhecidas
    this.peripheralsBrands = [
      'logitech', 'razer', 'hyperx', 'redragon', 'corsair', 'steelseries',
      'attack shark', 'royal kludge', 'rk', 'akko', 'machenike', 'delux',
      'fifine', 'darmoshark', 'vgn', 'ajazz', 'epomaker', 'keychron', 'edifier', 'jbl'
    ];
  }

  /**
   * Classifica o título do produto em uma das 4 categorias principais
   * e extrai especificações técnicas detalhadas.
   * 
   * @param {string} title Título do produto
   * @param {Object} [metadata={}] Metadados opcionais (preço, desconto, etc.)
   * @returns {Object} Resultado detalhado da classificação
   */
  classify(title, metadata = {}) {
    if (!title || typeof title !== 'string') {
      return {
        category: this.CATEGORIES.OTHER_GAMER,
        subCategory: 'Geral',
        isGamer: false,
        appealScore: 0,
        appealBadge: null,
        specs: {}
      };
    }

    const t = title.toLowerCase();
    const specs = this.extractSpecs(title, t);

    // 1. VERIFICAÇÃO: GPUs (Placas de Vídeo)
    const gpuMatch = this.matchGpu(t);
    if (gpuMatch || /placa de v[ií]deo|gpu gamer|geforce|radeon/i.test(title)) {
      const appealScore = this.calculateGpuAppeal(gpuMatch, specs, metadata);
      return {
        category: this.CATEGORIES.GPUS,
        subCategory: gpuMatch ? gpuMatch.series : 'GPU Geral',
        model: gpuMatch ? gpuMatch.model : 'Placa de Vídeo',
        tier: gpuMatch ? gpuMatch.tier : 'Custo-Benefício',
        specs,
        appealScore,
        appealBadge: this.resolveAppealBadge(appealScore, 'GPU'),
        isGamer: true
      };
    }

    // 2. VERIFICAÇÃO: CPUs & Kits Upgrade
    const isKit = /kit\s*upgrade|combo\s*upgrade|kit\s*gamer|kit\s*placa\s*m[aã]e/i.test(title);
    const cpuMatch = this.matchCpu(t);
    if (isKit || cpuMatch || /processador\s*(amd|intel)|intel\s*core|amd\s*ryzen/i.test(title)) {
      const appealScore = this.calculateCpuAppeal(cpuMatch, isKit, specs, metadata);
      return {
        category: this.CATEGORIES.CPUS_KITS,
        subCategory: isKit ? 'Kit Upgrade' : (cpuMatch ? cpuMatch.series : 'Processador'),
        model: cpuMatch ? cpuMatch.model : (isKit ? 'Kit Upgrade Gamer' : 'Processador'),
        tier: cpuMatch ? cpuMatch.tier : (isKit ? 'Upgrade Gamer' : 'Intermediário'),
        specs,
        appealScore,
        appealBadge: this.resolveAppealBadge(appealScore, isKit ? 'Kit' : 'CPU'),
        isGamer: true
      };
    }

    // 3. VERIFICAÇÃO: Monitores Gamer
    const isMonitor = /\bmonitor\b/i.test(title) && !/press[aã]o|card[ií]aco|beb[eê]|bab[aá]|hospitalar/i.test(t);
    if (isMonitor || specs.refreshRate || /painel\s*ips|oled\s*gamer|ultrawide/i.test(title)) {
      const appealScore = this.calculateMonitorAppeal(specs, metadata);
      return {
        category: this.CATEGORIES.MONITORS,
        subCategory: specs.panel ? `Monitor ${specs.panel}` : 'Monitor Gamer',
        model: specs.screenSize ? `${specs.screenSize} ${specs.refreshRate || ''}`.trim() : 'Monitor Gamer',
        tier: specs.refreshRate && parseInt(specs.refreshRate, 10) >= 240 ? 'Pro Gaming' : 'Alta Taxa de Atualização',
        specs,
        appealScore,
        appealBadge: this.resolveAppealBadge(appealScore, 'Monitor'),
        isGamer: true
      };
    }

    // 4. VERIFICAÇÃO: Periféricos & Custo-Benefício
    const peripheralCategory = this.matchPeripheral(title, t, specs);
    if (peripheralCategory) {
      const appealScore = this.calculatePeripheralAppeal(peripheralCategory, specs, metadata);
      return {
        category: this.CATEGORIES.PERIPHERALS_VALUE,
        subCategory: peripheralCategory.name,
        brand: peripheralCategory.brand,
        specs,
        appealScore,
        appealBadge: this.resolveAppealBadge(appealScore, peripheralCategory.name),
        isGamer: true
      };
    }

    // 5. Hardware Core complementar (SSD, RAM, Fonte, Cooler, Gabinete)
    if (/ssd|nvme|m\.2|mem[oó]ria\s*ram|ddr4|ddr5|water\s*cooler|air\s*cooler|fonte\s*(atx|80\s*plus)|gabinete/i.test(t)) {
      return {
        category: this.CATEGORIES.HARDWARE_CORE,
        subCategory: this.detectHardwareSubcategory(t),
        specs,
        appealScore: 70,
        appealBadge: '⚡ SETUP ESSENCIAL',
        isGamer: true
      };
    }

    return {
      category: this.CATEGORIES.OTHER_GAMER,
      subCategory: 'Acessórios & Setup',
      specs,
      appealScore: 50,
      appealBadge: null,
      isGamer: /gamer|rgb|pc/i.test(t)
    };
  }

  /**
   * Extração de especificações técnicas do título
   */
  extractSpecs(rawTitle, t) {
    const specs = {};

    // VRAM (ex: 8GB, 12GB, 16GB, 24GB GDDR6X)
    const vramMatch = rawTitle.match(/(\d{1,2})\s*(?:gb|g)\s*(gddr[56]x?|ddr[56])?/i);
    if (vramMatch && /rtx|gtx|rx|radeon|placa de v[ií]deo|gpu/i.test(t)) {
      specs.vram = `${vramMatch[1]}GB ${vramMatch[2] ? vramMatch[2].toUpperCase() : ''}`.trim();
    }

    // Taxa de Atualização de Monitor (144Hz, 165Hz, 180Hz, 240Hz, 360Hz)
    const hzMatch = rawTitle.match(/\b(360|280|240|180|170|165|144|120|100|75)\s*hz\b/i);
    if (hzMatch) {
      specs.refreshRate = `${hzMatch[1]}Hz`;
    }

    // Tipo de Painel (IPS, Fast IPS, OLED, QD-OLED, VA)
    if (/\b(fast\s*ips|qd-oled|oled|ips|va)\b/i.test(rawTitle)) {
      const panelMatch = rawTitle.match(/\b(fast\s*ips|qd-oled|oled|ips|va)\b/i);
      specs.panel = panelMatch[1].toUpperCase();
    }

    // Tamanho de Tela (24", 27", 32", 34", etc.)
    const sizeMatch = rawTitle.match(/\b(49|34|32|29|27|25|24|23\.8|21\.5)\s*(?:pol|polegadas|["'’])/i);
    if (sizeMatch) {
      specs.screenSize = `${sizeMatch[1]}"`;
    }

    // Resolução (4K, QHD / 1440p / 2K, Full HD / 1080p)
    if (/\b(4k|uhd|3840x2160)\b/i.test(t)) specs.resolution = '4K UHD';
    else if (/\b(qhd|1440p|2\.5k|2k|2560x1440)\b/i.test(t)) specs.resolution = 'QHD (1440p)';
    else if (/\b(full\s*hd|1080p|1920x1080)\b/i.test(t)) specs.resolution = 'Full HD (1080p)';

    // Tempo de resposta (1ms, 0.5ms)
    const msMatch = rawTitle.match(/\b(0\.5|1|2)\s*ms\b/i);
    if (msMatch) specs.responseTime = `${msMatch[1]}ms`;

    // Tipo de Switch Mecânico (Blue, Red, Brown, Silver, Hot-Swap)
    if (/switch\s*(red|blue|brown|black|silver|yellow|white|optical)/i.test(rawTitle)) {
      const swMatch = rawTitle.match(/switch\s*(red|blue|brown|black|silver|yellow|white|optical)/i);
      specs.switch = swMatch[1].toUpperCase();
    }
    if (/hot[- ]?swap/i.test(rawTitle)) specs.hotSwap = true;

    // Sensores de Mouse (PAW 3395, 3325, Hero, etc.)
    const sensorMatch = rawTitle.match(/\b(paw\s*3395|paw\s*3311|pmw\s*3325|pmw\s*3389|hero\s*25k|hero\s*16k|focus\s*pro)\b/i);
    if (sensorMatch) specs.sensor = sensorMatch[1].toUpperCase();

    // Capacidade de Memória / Armazenamento (SSD NVMe / RAM)
    const capacityMatch = rawTitle.match(/\b(2tb|1tb|512gb|500gb|480gb|256gb|240gb|128gb|32gb|16gb|8gb)\b/i);
    if (capacityMatch && /ssd|nvme|ram|mem[oó]ria/i.test(t)) {
      specs.capacity = capacityMatch[1].toUpperCase();
    }

    return specs;
  }

  matchGpu(titleLower) {
    for (const item of this.gpuPatterns) {
      const match = titleLower.match(item.regex);
      if (match) {
        return {
          series: item.series,
          tier: item.tier,
          model: match[0].toUpperCase()
        };
      }
    }
    return null;
  }

  matchCpu(titleLower) {
    for (const item of this.cpuPatterns) {
      const match = titleLower.match(item.regex);
      if (match) {
        return {
          series: item.series,
          tier: item.tier,
          model: match[0].toUpperCase()
        };
      }
    }
    return null;
  }

  matchPeripheral(rawTitle, titleLower, specs) {
    let brand = this.peripheralsBrands.find(b => titleLower.includes(b));
    brand = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : null;

    if (/teclado\s*(mec[aâ]nico|gamer)|keyboard\s*mechanic/i.test(titleLower)) {
      return { name: 'Teclado Mecânico', brand: brand || 'Gamer' };
    }
    if (/mouse\s*gamer|mouse\s*(sem\s*fio|wireless)\s*(gamer|paw)/i.test(titleLower) || specs.sensor) {
      return { name: 'Mouse Gamer', brand: brand || 'Gamer' };
    }
    if (/headset\s*gamer|fone\s*gamer|headphone\s*gamer/i.test(titleLower)) {
      return { name: 'Headset Gamer', brand: brand || 'Gamer' };
    }
    if (/microfone\s*(condensador|gamer|streamer|usb)|fifine|quadcast/i.test(titleLower)) {
      return { name: 'Microfone de Stream', brand: brand || 'Áudio' };
    }
    if (/mousepad\s*gamer|mouse\s*pad\s*(speed|control|deskmat|900x400)/i.test(titleLower)) {
      return { name: 'Mousepad Gamer', brand: brand || 'Setup' };
    }
    if (/cadeira\s*gamer/i.test(titleLower)) {
      return { name: 'Cadeira Gamer', brand: brand || 'Ergonomia' };
    }
    return null;
  }

  detectHardwareSubcategory(titleLower) {
    if (/ssd|nvme|m\.2/i.test(titleLower)) return 'Armazenamento SSD NVMe';
    if (/mem[oó]ria\s*ram|ddr[45]/i.test(titleLower)) return 'Memória RAM';
    if (/water\s*cooler/i.test(titleLower)) return 'Water Cooler';
    if (/air\s*cooler|cooler/i.test(titleLower)) return 'Air Cooler';
    if (/fonte\s*(atx|80\s*plus)/i.test(titleLower)) return 'Fonte de Alimentação';
    if (/gabinete/i.test(titleLower)) return 'Gabinete Gamer';
    return 'Hardware PC';
  }

  // Cálculos de Apelo Gamer (Gamer Appeal Score) de 0 a 100
  calculateGpuAppeal(gpuMatch, specs, metadata) {
    let score = 75;
    if (!gpuMatch) return score;

    // GPUs queridinhas do público brasileiro
    const highDemand = ['RTX 4060', 'RTX 4060 TI', 'RTX 4070', 'RTX 3060', 'RX 6600', 'RX 6750 XT', 'RX 7600'];
    if (highDemand.some(m => gpuMatch.model.includes(m))) {
      score += 15;
    }

    if (metadata.discountPercent && metadata.discountPercent >= 15) {
      score += 10;
    }
    return Math.min(100, score);
  }

  calculateCpuAppeal(cpuMatch, isKit, specs, metadata) {
    let score = 70;
    if (isKit) score += 15; // Kits Upgrade são campeões de vendas e cliques
    if (cpuMatch) {
      if (cpuMatch.series === 'Ryzen 3D V-Cache') score += 20; // 5700X3D / 7800X3D
      if (/5600|5700X|12400F|13400F|7600/i.test(cpuMatch.model)) score += 15;
    }
    if (metadata.discountPercent && metadata.discountPercent >= 15) {
      score += 10;
    }
    return Math.min(100, score);
  }

  calculateMonitorAppeal(specs, metadata) {
    let score = 70;
    if (specs.refreshRate) {
      const hz = parseInt(specs.refreshRate, 10);
      if (hz >= 240) score += 20;
      else if (hz >= 144) score += 15;
    }
    if (specs.panel === 'IPS' || specs.panel === 'FAST IPS' || specs.panel === 'OLED') {
      score += 10;
    }
    return Math.min(100, score);
  }

  calculatePeripheralAppeal(peripheral, specs, metadata) {
    let score = 65;
    if (this.peripheralsBrands.some(b => peripheral.brand && peripheral.brand.toLowerCase() === b)) {
      score += 15; // Marca reconhecida
    }
    if (specs.hotSwap || specs.sensor) score += 10;
    return Math.min(100, score);
  }

  resolveAppealBadge(score, type) {
    if (score >= 90) return '🔥 SUPER DESTAQUE GAMER';
    if (score >= 80) return '⚡ ALTO DESEMPENHO';
    if (score >= 70) return '🎯 CUSTO-BENEFÍCIO GAMER';
    return null;
  }

  /**
   * Identifica se uma oferta deve ter prioridade máxima de disparo
   */
  isHighAppealDeal(productClassification) {
    return productClassification.appealScore >= 80;
  }
}

module.exports = new GamerClassifierService();
