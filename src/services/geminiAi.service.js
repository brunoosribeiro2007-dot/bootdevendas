/**
 * ==============================================================================
 * GEMINI AI SERVICE (src/services/geminiAi.service.js)
 * ==============================================================================
 * Módulo de Inteligência Artificial usando a biblioteca oficial @google/genai.
 * Responsabilidades:
 * 1. Formatar ofertas de alta conversão para WhatsApp/Telegram com regras de ouro
 *    (Gancho de impacto emocional, produto limpo estruturado, trava anti-confusão
 *     de acessórios, limpeza de SEO e silêncio absoluto).
 * 2. Gerar buscas altamente específicas com Marca + Modelo em JSON estruturado
 *    usando responseSchema e responseMimeType: 'application/json'.
 * ==============================================================================
 */

const { GoogleGenAI, Type } = require('@google/genai');
const env = require('../config/env');
const logger = require('../config/logger');
const { isDeceptiveAccessory } = require('../helpers/accessoryDetector');

// System Instruction oficial para formatação de alta conversão
const FORMATTER_SYSTEM_INSTRUCTION = `Você é o motor de inteligência de um bot de promoções de alta conversão para WhatsApp e Telegram (Amazon, Mercado Livre e Shopee).

REGRAS OBRIGATÓRIAS:
1. GANCHO: 2 a 4 palavras em MAIÚSCULAS no topo, pura emoção (Ex: 🔥 PREÇO DESPENCOU!). Proibido colocar nome ou marca do produto no gancho.
2. PRODUTO: Estruturado exatamente como [Tipo do Produto] + [Marca] + [Modelo] + [Especificação Principal].
3. TRAVA ANTI-CONFUSÃO: Se o anúncio for de suporte, cabo, capa, película ou refil, deixe explícito logo na primeira palavra que o produto é o acessório, NUNCA o aparelho principal compatível.
4. LIMPEZA DE SEO: Remova termos inúteis como "Original", "Envio Imediato", "Full", "Nota Fiscal", "Lançamento", "Pronta Entrega".
5. SILÊNCIO ABSOLUTO: Retorne APENAS a postagem formatada. É estritamente proibido adicionar notas explicativas, justificativas, avisos de trava anti-confusão, introduções ou comentários sobre as regras.

FORMATO EXATO DE SAÍDA:
[Emoji] *[GANCHO]*

📦 *[Produto Limpo]*

💰 Por: *[Preço]*
_(Adicione uma linha curta de parcelamento, preço antigo ou cupom apenas se informado nos detalhes)_

🛒 *Compre aqui:* [Link]`;

// Instância singleton inicializada sob demanda
let aiClient = null;

function getAiClient() {
  const apiKey = env.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({ apiKey });
      logger.info('[GeminiAiService] ✅ Cliente Google GenAI inicializado com sucesso.');
    } catch (err) {
      logger.warn(`[GeminiAiService] ⚠️ Erro ao inicializar Google GenAI: ${err.message}`);
      return null;
    }
  }
  return aiClient;
}

/**
 * Limpa títulos de forma local (fallback determinístico quando a IA não estiver disponível).
 * @param {string} rawTitle 
 * @returns {string}
 */
function localCleanTitle(rawTitle) {
  if (!rawTitle) return 'Produto em Oferta';
  let t = rawTitle;

  // Lixo de SEO
  const seoJunk = [
    /\b(envio imediato|pronta entrega|com nota fiscal|nota fiscal|nf|original|lacrado|lancamento|lançamento|full|novo|promocao|promoção|oferta|imperdivel|imperdível)\b/gi,
    /\b(para pc gamer|pc gamer|gamer|top|melhor preco|melhor preço|frete gratis|frete grátis)\b/gi
  ];
  for (const regex of seoJunk) {
    t = t.replace(regex, '');
  }

  // Trava anti-confusão local se for acessório
  const accessoryMatches = t.match(/\b(suporte|cabo|capa|capinha|película|pelicula|refil|case|grip|dock|adesivo|skin)\b/i);
  if (accessoryMatches) {
    const acc = accessoryMatches[1].charAt(0).toUpperCase() + accessoryMatches[1].slice(1).toLowerCase();
    if (!t.toLowerCase().startsWith(acc.toLowerCase())) {
      t = `${acc} compatível: ${t}`;
    }
  }

  return t.replace(/\s{2,}/g, ' ').replace(/[|–—]/g, '-').trim();
}

/**
 * Formata os dados de um produto no template de alta conversão usando o Gemini 2.5 Flash.
 * Caso a API falhe ou a chave não esteja configurada, recorre a um fallback determinístico.
 * 
 * @param {object} params
 * @param {string} params.titulo - Título bruto do produto
 * @param {string|number} params.preco - Preço (ex: "R$ 1.799,00" ou 1799)
 * @param {string} params.link - Link de afiliado do produto
 * @param {string} [params.detalhes] - Informações adicionais (parcelamento, cupom, etc.)
 * @returns {Promise<string>} Mensagem pronta formatada
 */
async function formatarOfertaComIA({ titulo, preco, link, detalhes = '' }) {
  const precoStr = typeof preco === 'number'
    ? `R$ ${preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : String(preco || '');

  const ai = getAiClient();

  if (ai) {
    try {
      const userPrompt = `Formate a oferta a seguir:\nTítulo: ${titulo}\nPreço: ${precoStr}\nLink: ${link}\nDetalhes: ${detalhes || 'Nenhum'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: FORMATTER_SYSTEM_INSTRUCTION,
          temperature: 0.2
        }
      });

      const output = response.text ? response.text.trim() : '';
      if (output && output.includes('Compre aqui:')) {
        return output;
      }
    } catch (err) {
      logger.warn(`[GeminiAiService] ⚠️ Erro na chamada formatarOfertaComIA: ${err.message}. Ativando fallback local.`);
    }
  }

  // ─── FALLBACK DETERMINÍSTICO SE A IA ESTIVER OFFLINE ───────────────────────
  const cleanTitle = localCleanTitle(titulo);
  const detailsLine = detalhes ? `\n_(${detalhes})_` : '';

  return `🔥 *PREÇO IMBATÍVEL!*

📦 *${cleanTitle}*

💰 Por: *${precoStr}*${detailsLine}

🛒 *Compre aqui:* ${link}`;
}

/**
 * Gera 15 termos de busca altamente específicos (Marca + Modelo) em JSON estrito.
 * Utiliza responseSchema e responseMimeType: 'application/json' do @google/genai.
 * 
 * @param {string} [categorias] - Categorias desejadas
 * @returns {Promise<string[]>} Array com exatamente 15 termos de busca
 */
async function gerarBuscasComIA(categorias = 'hardware, periféricos gamer, áudio, SSD, monitores e utilidades domésticas') {
  const ai = getAiClient();

  if (ai) {
    try {
      const prompt = `Gere uma lista de 15 termos de busca altamente específicos de produtos de alta procura no Brasil dentro das seguintes categorias: ${categorias}.
Regras obrigatórias:
1. OBRIGATÓRIO incluir Marca + Modelo exato (ex: "Ryzen 7 5700X", "Placa de Vídeo RTX 4060", "Air Fryer Mondial 4L").
2. PROIBIDO usar termos genéricos sozinhos (ex: "processador", "airfryer", "fone", "mouse", "teclado").
3. Retorne um array JSON contendo exatamente 15 strings.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING
            }
          }
        }
      });

      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        logger.info(`[GeminiAiService] ✨ 15 termos gerados com sucesso via Gemini (${parsed.length} itens).`);
        return parsed.slice(0, 15);
      }
    } catch (err) {
      logger.warn(`[GeminiAiService] ⚠️ Erro na chamada gerarBuscasComIA: ${err.message}. Usando sementes padrão.`);
    }
  }

  // ─── FALLBACK DE SEMENTES DE ALTA PROCURA ──────────────────────────────────
  return [
    'Ryzen 7 5700X',
    'Placa de Vídeo RTX 4060',
    'Processador Core i5 12400F',
    'Placa-Mãe B550M Aorus Elite',
    'SSD Kingston NV2 1TB',
    'Memória RAM Corsair Vengeance 16GB',
    'Mouse Sem Fio Logitech G305',
    'Teclado Mecânico Redragon Kumara',
    'Headset Gamer HyperX Cloud Stinger',
    'Monitor Gamer AOC Hero 24 144Hz',
    'Controle Sony DualSense PS5',
    'Fritadeira Air Fryer Mondial Family 4L',
    'Robô Aspirador WAP Robot W300',
    'Cafeteira Nespresso Essenza Mini',
    'Panela de Pressão Elétrica Electrolux 6L'
  ];
}

module.exports = {
  formatarOfertaComIA,
  gerarBuscasComIA,
  FORMATTER_SYSTEM_INSTRUCTION
};
