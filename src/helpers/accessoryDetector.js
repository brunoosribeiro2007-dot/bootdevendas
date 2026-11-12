/**
 * ==============================================================================
 * ACCESSORY & ANTI-DECEPTIVE DETECTOR (src/helpers/accessoryDetector.js)
 * ==============================================================================
 * Detecta e bloqueia acessórios secundários (suportes plásticos, capinhas,
 * películas de vidro, adesivos/skins, cabos, grips) que usam palavras-chave
 * apelativas nos títulos para se passar por produtos principais caros
 * (como Consoles PS5, Controles DualSense, Smartphones Galaxy S25 / iPhone e Smart TVs).
 * ==============================================================================
 */

/**
 * Valida se o produto é um acessório secundário incompatível com o produto principal.
 * @param {Object} produto - Objeto com { title, price }
 * @returns {boolean} True se for acessório secundário/enganoso
 */
function isDeceptiveAccessory(produto) {
  if (!produto || typeof produto !== 'object') return false;
  const title = (produto.title || '').trim();
  if (!title) return false;

  const t = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const price = Number(produto.price) || 0;

  // 1. Controles de Videogame (PS5 DualSense, Xbox Controller)
  // Um controle DualSense / Xbox original novo custa no mínimo R$ 250 a R$ 450.
  // Qualquer item abaixo de R$ 150 ou contendo palavras de suporte/capa/grip NÃO é o controle.
  if (/controle|dualsense/i.test(t) && /ps5|playstation|xbox|switch/i.test(t)) {
    if (/\b(suporte|base|porta|capa|capinha|case|silicone|skin|adesivo|adesivos|adesiva|grip|grips|protetor|protetores|cabo|dock|charging|estojo|bolsa|extensor|bateria|pilha|parafuso|chassi|carregador|station|anal[oó]gico)\b/i.test(t)) {
      return true;
    }
    if (price > 0 && price < 150) {
      return true;
    }
  }

  // 2. Consoles de Videogame (PlayStation 5, Xbox Series X/S, Nintendo Switch)
  // Um console real custa no mínimo R$ 1.500+.
  if (/playstation\s*5|ps5|xbox\s*series|nintendo\s*switch/i.test(t)) {
    if (/\b(suporte|base|porta|capa|capinha|case|skin|skins|adesivo|adesivos|adesiva|bolsa|mochila|cooler|fan|faceplate|placa|tampa|painel|cabo|dock|filtro|dust|poeira|hub usb|stand)\b/i.test(t)) {
      return true;
    }
    if (/console/i.test(t) && price > 0 && price < 1200) {
      return true;
    }
  }

  // 3. Smartphones Top de Linha (iPhone, Galaxy S25 / S24 / S23)
  // Um smartphone topo de linha custa no mínimo R$ 1.200 a R$ 8.000+.
  if (/galaxy\s*s2[345]|iphone\s*(?:1[3456]|pro|promax)|smartphone|celular/i.test(t)) {
    if (/\b(capa|capinha|case|cases|pelicula|pelicula|vidro|lente|protetor|protetores|camera|câmera|cabo|carregador|fonte|adaptador|suporte|skin|adesivo|pop\s*socket)\b/i.test(t)) {
      return true;
    }
    if (/iphone|galaxy\s*s2/i.test(t) && price > 0 && price < 1000) {
      return true;
    }
  }

  // 4. Smart TVs
  // Uma TV real custa no mínimo R$ 600 a R$ 4.000+.
  if (/smart\s*tv|televis[aã]o|\btv\b/i.test(t)) {
    if (/\b(suporte|articulado|inclinavel|parede|teto|painel|rack|controle remoto|capa|cabo|cabo hdmi|placa|conversor|antena|led strip|fita led)\b/i.test(t)) {
      return true;
    }
    if (price > 0 && price < 500) {
      return true;
    }
  }

  // 5. Gabinetes Gamer
  // Um gabinete gamer completo custa no mínimo R$ 90+.
  if (/\bgabinete\b/i.test(t)) {
    if (/\b(cooler fan|ventoinha|kit \d+ fans|fita led|filtro de poeira|parafuso|suporte de vga|suporte gpu)\b/i.test(t) && !/\bgabinete gamer\b/i.test(t)) {
      return true;
    }
    if (price > 0 && price < 80) {
      return true;
    }
  }

  // 6. Produtos cujo título COMEÇA com termos típicos de acessório
  if (/^(suporte|porta|base|capa|capinha|case|pelicula|adesivo|skin|cabo|adaptador)\b/i.test(t)) {
    // Se não for categoria de suporte doméstico de baixo custo aceitável do nicho Casa
    if (/ps5|playstation|controle|dualsense|xbox|gamer|iphone|galaxy|celular|tv|monitor/i.test(t)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isDeceptiveAccessory
};
