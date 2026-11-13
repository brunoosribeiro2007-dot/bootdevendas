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

  // 6. Memória RAM, SSDs, Processadores e Hardware (Dissipadores, Thermal Pads, Pastas Térmicas)
  if (/mem[oó]ria\s*ram|ram\s*ddr|ddr[345]|nvme|ssd|m\.2|processador|placa\s*de\s*v[ií]deo|rtx|gtx|radeon/i.test(t)) {
    if (/\b(dissipador|dissipadores|thermal\s*pad|thermal\s*pads|heatsink|pasta\s*t[eé]rmica|suporte\s*gpu|suporte\s*vga|cabo\s*riser|backplate|case\s*para\s*ssd|case\s*ssd|gaveta\s*ssd|adaptador\s*ssd|adaptador\s*m\.?2|espelho|espaguete)\b/i.test(t)) {
      return true;
    }
    // Pisos de preço real para peças de hardware
    if (/(mem[oó]ria\s*ram|ram\s*ddr[45])/i.test(t) && price > 0 && price < 75) {
      return true;
    }
    if (/\bssd\b|\bnvme\b/i.test(t) && price > 0 && price < 80) {
      return true;
    }
    if (/\b(rtx|gtx|radeon|placa\s*de\s*v[ií]deo)\b/i.test(t) && price > 0 && price < 350) {
      return true;
    }
  }

  // 7. Caixas de Som de Baixa Qualidade (Mini caixinhas 3W genéricas, speakers USB/P2 baratos)
  if (/caix(a|inha)\s*de\s*som/i.test(t) || /alto[- ]falante/i.test(t)) {
    if (/\b(mini\s*caixinha|3w|2\.0.*3w|caixinha.*usb|mini.*p2|usb\s*p2.*3w|som\s*notebook\s*3w)\b/i.test(t)) {
      return true;
    }
    const isReputableAudioBrand = /\b(jbl|edifier|anker|soundcore|sony|philips|tronsmart|logitech|redragon|samsung|lg|xiaomi|w-king)\b/i.test(t);
    if (!isReputableAudioBrand && price > 0 && price < 60) {
      return true;
    }
  }

  // 8. Peças e Acessórios Automotivos (Tapetes de Carro, Assoalhos, Peças Mecânicas de Veículos)
  if (/\b(assoalho|porta[- ]malas|carpete\s*automotivo|tapete\s*automotivo|capota|estribo|engate|para[- ]choque|parachoque|calha\s*de\s*chuva|insulfilm|amortecedor|pastilha\s*de\s*freio|disco\s*de\s*freio|embreagem|escapamento|volante\s*esportivo|painel\s*automotivo|macaco\s*jacar[eé]|chave\s*de\s*roda|bico\s*injetor|sensor\s*estacionamento|c[aâ]mera\s*de\s*r[eé]|quebra[- ]sol|friso\s*lateral|aerof[oó]lio|lanterna\s*traseira)\b/i.test(t)) {
    return true;
  }
  if (/\b(tapete|carpete|capa|assoalho)\b/i.test(t) && /\b(ford|fiat|chevrolet|volkswagen|vw|toyota|honda|hyundai|renault|nissan|jeep|peugeot|citroen|mitsubishi|pampa|gol|palio|uno|corsa|celta|onix|hb20|corolla|civic|strada|hilux|saveiro|s10|ranger|toro|veiculo|veicular|automotivo|automotiva|carro)\b/i.test(t)) {
    return true;
  }

  // 9. Produtos cujo título COMEÇA com termos típicos de acessório
  if (/^(suporte|porta|base|capa|capinha|case|pelicula|adesivo|skin|cabo|adaptador|dissipador)\b/i.test(t)) {
    // Se não for categoria de suporte doméstico de baixo custo aceitável do nicho Casa
    if (/ps5|playstation|controle|dualsense|xbox|gamer|iphone|galaxy|celular|tv|monitor|ram|ddr|ssd|nvme/i.test(t)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  isDeceptiveAccessory
};

