/**
 * ==============================================================================
 * HARDWARE & NICHE FILTER (src/helpers/hardwareFilter.js)
 * ==============================================================================
 * 1. isObsoleteHardware:
 *    Identifica e bloqueia componentes de hardware antigos, defasados ou
 *    e-waste (placas-mãe antigas H61/H81/B75/X79/X99, CPUs antigas i7-3770/i3-7100,
 *    GPUs de mineração antigas RX 580/GT 710/GTX 750, DDR3/DDR2, etc.).
 * 2. isProductMatchingNiche:
 *    Garante isolamento estrito de nichos, impedindo que hardware/tech vá para Casa
 *    ou que utilidades domésticas/móveis vão para PC Gamer.
 * ==============================================================================
 */

// Regex de placas-mãe e chipsets antigos/obsoletos
const OBSOLETE_MOTHERBOARDS_REGEX = /\b(h55|h61|h67|h77|h81|h87|h97|b75|b85|p67|z68|z77|z87|z97|g31|g41|945|q67|q77|x58|x79|x99|lga\s*775|lga\s*1156|lga\s*1155|lga\s*1150|lga\s*2011|lga\s*1366|socket\s*am2|socket\s*am3|socket\s*fm2|am3\+|fm2\+|a320m?|760g|78lmt|n68)\b/i;

// Regex de placas de vídeo (GPUs) obsoletas
const OBSOLETE_GPUS_REGEX = /\b(rx\s*580|rx\s*570|rx\s*560|rx\s*550|rx\s*480|rx\s*470|rx\s*460|r9\s*\d+|r7\s*\d+|hd\s*[567]\d{3}|gt\s*610|gt\s*710|gt\s*730|gt\s*1030|gtx\s*550|gtx\s*650|gtx\s*660|gtx\s*750(?:\s*ti)?|gtx\s*760|gtx\s*950|gtx\s*960|gtx\s*970|gtx\s*980)\b/i;

// Regex de processadores (CPUs) obsoletos (Intel pré-10ª geração e AMD FX/Athlon antigos)
const OBSOLETE_CPUS_REGEX = /\b(core\s*2\s*duo|core\s*2\s*quad|pentium|celeron|xeon\s*e5|xeon\s*x\d+|fx[\s-]?\d{4}|phenom|athlon(?!\s*3000g)|i[3579][\s-](?:[2-9]\d{3}[a-z]*|10\d{3}[a-z]*)|i[357]-7\d{3}|i[357]-6\d{3}|i[357]-4\d{3}|i[357]-3\d{3}|i[357]-2\d{3})\b/i;

// Regex de memória RAM obsoleta ou inadequada para setup gamer moderno
const OBSOLETE_RAM_REGEX = /\b(ddr2|ddr3|pc3-|pc2-|4gb\s*ddr4|ddr4\s*4gb|rdimm|ecc\s*reg|servidor|adaptadormem[oó]ria|adaptador\s*(?:de\s*)?mem[oó]ria)\b/i;

// Regex de armazenamento obsoleto (SSDs ultra-pequenos)
const OBSOLETE_STORAGE_REGEX = /\b(ssd\s*(?:120|128)\s*gb|(?:120|128)\s*gb\s*ssd|hd\s*ssd\s*(?:120|128)\s*gb)\b/i;

// Termos estritos de tecnologia / PC gamer que NUNCA devem ir para Casa / Oferta Lar
const TECH_TERMS_REGEX = /\b(placa\s*m[aã]e|placa\s*de\s*v[ií]deo|rtx\s*\d+|gtx\s*\d+|radeon\s*rx|ryzen|core\s*i[3579]|intel\s*core|processador\s*amd|mem[oó]ria\s*ram|ddr[45]|water\s*cooler|gabinete\s*gamer|pc\s*gamer|fonte\s*atx|cooler\s*fan|teclado\s*mec[aâ]nico|mouse\s*gamer|headset\s*gamer|playstation\s*5|dualsense|xbox\s*series|nintendo\s*switch|monitor\s*gamer|ssd\s*nvme)\b/i;

// Termos estritos de Casa / Lar que NUNCA devem ir para PC Gamer / Infomarket
const CASA_TERMS_REGEX = /\b(air\s*fryer|fritadeira|liquidificador|batedeira|sanduicheira|panela|jogo\s*de\s*panelas|fog[aã]o|cooktop|micro-?ondas|forno\s*el[eé]trico|aspirador|mop|toalha|len[cç]ol|edredom|travesseiro|colch[aã]o|sof[aá]|guarda-roupa|mesa\s*de\s*jantar|purificador\s*de\s*[aá]gua|ferro\s*de\s*passar|adega\s*climatizada)\b/i;

/**
 * Valida se um produto contém hardware obsoleto, defasado ou e-waste.
 * @param {Object} product - { title, description, ... }
 * @returns {boolean} True se for hardware obsoleto
 */
function isObsoleteHardware(product) {
  if (!product || typeof product !== 'object') return false;
  const title = (product.title || '').trim();
  if (!title) return false;

  const t = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Placas-mãe antigas (H61, H81, B75, X79, X99, LGA 1155, LGA 775, etc.)
  if (OBSOLETE_MOTHERBOARDS_REGEX.test(t)) {
    return true;
  }

  // 2. Placas de vídeo antigas (RX 580, GT 710, GTX 750, etc.)
  if (OBSOLETE_GPUS_REGEX.test(t)) {
    return true;
  }

  // 3. Processadores antigos (Intel 2ª a 9ª ger, Core 2 Duo, FX, etc.)
  if (OBSOLETE_CPUS_REGEX.test(t)) {
    return true;
  }

  // 4. Memória RAM antiga (DDR3, DDR2, 4GB DDR4 para gamer, memória de servidor)
  if (OBSOLETE_RAM_REGEX.test(t)) {
    return true;
  }

  // 5. SSDs defasados (120GB / 128GB)
  if (OBSOLETE_STORAGE_REGEX.test(t)) {
    return true;
  }

  // 6. Kits gamers falsos com processadores antigos (ex: PC Gamer i7 3770 / i5 3470 / i7 2600)
  if (/pc\s*gamer/i.test(t) && /(i[57][\s-]?3\d{3}|i[57][\s-]?2\d{3}|i[57][\s-]?4\d{3}|lga\s*1155)/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * Valida se o produto é compatível com o nicho de destino.
 * @param {Object} product - { title, description, niche, ... }
 * @param {string} targetNiche - 'casa' | 'pc_gamer'
 * @returns {boolean} True se for compatível com o nicho
 */
function isProductMatchingNiche(product, targetNiche) {
  if (!product || !targetNiche) return true;
  const cleanNiche = String(targetNiche).toLowerCase();
  const title = (product.title || '').trim();
  if (!title) return false;

  const t = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (cleanNiche.includes('casa') || cleanNiche.includes('lar')) {
    // Para CASA: rejeita terminantemente produtos de hardware, PC gamer ou consoles
    if (TECH_TERMS_REGEX.test(t)) {
      return false;
    }
  } else if (cleanNiche.includes('pc') || cleanNiche.includes('gamer') || cleanNiche.includes('hardware')) {
    // Para PC GAMER: rejeita terminantemente utilidades domésticas, eletrodomésticos de cozinha e móveis de casa
    if (CASA_TERMS_REGEX.test(t)) {
      return false;
    }
  }

  return true;
}

module.exports = {
  isObsoleteHardware,
  isProductMatchingNiche,
  OBSOLETE_MOTHERBOARDS_REGEX,
  OBSOLETE_GPUS_REGEX,
  OBSOLETE_CPUS_REGEX,
  OBSOLETE_RAM_REGEX,
  OBSOLETE_STORAGE_REGEX,
  TECH_TERMS_REGEX,
  CASA_TERMS_REGEX
};
