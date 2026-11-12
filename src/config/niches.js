/**
 * ==============================================================================
 * CONFIGURAÇÃO CENTRALIZADA MULTI-TENANT DE NICHOS (src/config/niches.js)
 * ==============================================================================
 * Define os perfis de audiência, vocabulário, regras de filtro, palavras-chave
 * e system prompt de inteligência artificial para cada nicho suportado.
 * ==============================================================================
 */

const NICHES = {
  casa: {
    id: 'casa',
    nicheName: 'Ofertas para o Lar',
    defaultStoreName: 'OfertaLar',
    searchKeywords: [
      'air fryer mondial',
      'aspirador de po robo',
      'organizador acrilico',
      'jogo de panelas ceramic',
      'torneira gourmet',
      'mop giratorio',
      'fogão',
      'cooktop',
      'geladeira',
      'forno elétrico',
      'micro-ondas',
      'panela de pressão elétrica',
      'liquidificador',
      'batedeira',
      'purificador de água',
      'conjunto sala de jantar',
      'smart tv'
    ],
    minDiscount: 0.15,
    minDiscountPercent: 15,
    seedFile: 'initial_products_casa.json',
    geminiNicheId: 'casa',
    copywriter: 'standard',
    systemPrompt: `Você é o motor de decisão, curadoria e redação do "Affiliate Engine", atuando como especialista em e-commerce de afiliados para o nicho de Casa e Decoração.

[NICHO: "casa" ou "ofertalar"]
- Público: Donas de casa, famílias, pessoas montando ou organizando o lar.
- Tom de Voz: Prático, acolhedor, focado em economia doméstica, utilidade e durabilidade.
- Vocabulário e Gatilhos: "Achadinho para o lar", "Praticidade na rotina", "Economia real", "Organização da casa", "Cozinha completa".
- Regras de Título: Mantenha capacidades, litros e voltagens (ex: "Air Fryer 4L", "Inox 110V", "Antiaderente").
- Desconto Mínimo Aceitável: 15%.`
  },

  pc_gamer: {
    id: 'pc_gamer',
    nicheName: 'Informática, Games & Tech',
    defaultStoreName: 'Infomarket',
    searchKeywords: [
      'gabinete gamer aquario',
      'gabinete mesh argb',
      'console playstation 5 slim',
      'playstation 5',
      'controle ps5 dualsense',
      'smart tv 4k 50 polegadas',
      'smart tv 4k 55 polegadas',
      'smart tv oled 120hz',
      'samsung galaxy s25',
      'samsung galaxy s25 ultra',
      'samsung galaxy s24 ultra',
      'iphone 16 pro',
      'iphone 16',
      'iphone 15 pro',
      'iphone 15',
      'notebook gamer rtx',
      'ssd nvme 1tb',
      'memoria ram ddr4 16gb',
      'memoria ram ddr5',
      'cooler argb',
      'mouse gamer sem fio',
      'teclado mecanico gamer',
      'fonte 650w plus bronze',
      'monitor 144hz',
      'placa de video rtx',
      'placa de video rx',
      'processador ryzen',
      'processador intel core',
      'headset gamer 7.1',
      'water cooler 240mm'
    ],
    minDiscount: 0.10,
    minDiscountPercent: 10,
    seedFile: 'initial_products_pc.json',
    geminiNicheId: 'pc_gamer',
    copywriter: 'gamer',
    systemPrompt: `Você é o motor de decisão, curadoria e redação do "Affiliate Engine", atuando como especialista em e-commerce de afiliados para o nicho de Informática, PC Gamer, Consoles e Tecnologia de Alto Desempenho.

[NICHO: "pc_gamer", "informatica" ou "tech"]
- Público: Gamers, entusiastas de tecnologia, hardware, consoles (PS5) e smartphones topo de linha (Galaxy S25, iPhone).
- Tom de Voz: Direto, moderno, técnico e empolgado, focado em custo-benefício, desempenho bruto e promoções imperdíveis.
- Vocabulário e Gatilhos: "Baita preço", "Upgrade que vale a pena", "Rodar no talo", "Desempenho bruto", "Setup dos sonhos", "Topo de linha", "Preço de Black Friday".
- Regras de Título: Mantenha sempre capacidades, modelos e frequências (ex: "PS5 Slim 1TB", "Galaxy S25 Ultra 512GB", "iPhone 16 Pro", "Smart TV 55 4K", "RTX 4060").
- Desconto Mínimo Aceitável: 10% (eletrônicos e tecnologia têm margens menores).`
  }
};

/**
 * Normaliza o identificador de nicho suportando aliases comuns.
 * Ex: 'hardware', 'gamer', 'tech' -> 'pc_gamer'
 * Ex: 'lar', 'ofertalar', 'home', 'casa' -> 'casa'
 */
const normalizeNicheId = (niche) => {
  const clean = String(niche || '').toLowerCase().trim();
  if (clean.includes('multi') || clean.includes('all') || clean.includes('both') || clean.includes('duplo')) {
    return 'multi';
  }
  if (clean.includes('pc') || clean.includes('gamer') || clean.includes('hardware') || clean.includes('tech')) {
    return 'pc_gamer';
  }
  return 'casa';
};

/**
 * Retorna a configuração completa do perfil ativo.
 * @param {string} [nicheId]
 */
const getNicheProfile = (nicheId) => {
  const normalized = normalizeNicheId(nicheId || process.env.NICHE);
  return NICHES[normalized] || NICHES.casa;
};

module.exports = {
  NICHES,
  normalizeNicheId,
  getNicheProfile
};
