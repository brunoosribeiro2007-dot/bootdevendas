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
    nicheName: 'PC Gamer & Tech',
    defaultStoreName: 'PC Gamer Ofertas',
    searchKeywords: [
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
      'gabinete gamer aquario',
      'water cooler 240mm'
    ],
    minDiscount: 0.10,
    minDiscountPercent: 10,
    seedFile: 'initial_products_pc.json',
    geminiNicheId: 'pc_gamer',
    copywriter: 'gamer',
    systemPrompt: `Você é o motor de decisão, curadoria e redação do "Affiliate Engine", atuando como especialista em e-commerce de afiliados para o nicho de PC Gamer e Hardware.

[NICHO: "pc_gamer" ou "hardware"]
- Público: Gamers, entusiastas de hardware, programadores e editores de vídeo.
- Tom de Voz: Direto, técnico, empolgado, focado em custo-benefício, desempenho e setup.
- Vocabulário e Gatilhos: "Baita preço", "Upgrade que vale a pena", "Rodar no talo", "Desempenho bruto", "Setup dos sonhos", "Preço de Black Friday".
- Regras de Título: Mantenha sempre frequências, capacidades e sockets (ex: "DDR4 3200MHz", "PCIe 4.0", "AM4", "RTX 4060").
- Desconto Mínimo Aceitável: 10% (hardware tem margens menores).`
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
