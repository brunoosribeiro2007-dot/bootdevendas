const { formatarOfertaComIA, gerarBuscasComIA, FORMATTER_SYSTEM_INSTRUCTION } = require('../src/services/geminiAi.service');

describe('GeminiAiService', () => {
  describe('formatarOfertaComIA', () => {
    test('formata produto corretamente no template de alta conversão (modo fallback / sem API key)', async () => {
      const input = {
        titulo: 'Placa De Vídeo Intel Arc B580 12GB GDDR6 Dual Fan Ray Tracing Lançamento Original Pronta Entrega Com Nota Fiscal Para PC Gamer',
        preco: 'R$ 1.799,00',
        link: 'https://amzn.to/exemplo123',
        detalhes: 'À vista no Pix ou 10x sem juros'
      };

      const resultado = await formatarOfertaComIA(input);

      expect(resultado).toContain('🔥 *PREÇO IMBATÍVEL!*');
      expect(resultado).toContain('📦 *Placa De Vídeo Intel Arc B580 12GB GDDR6 Dual Fan Ray Tracing*');
      // SEO lixo deve ter sido limpo
      expect(resultado).not.toContain('Pronta Entrega');
      expect(resultado).not.toContain('Com Nota Fiscal');
      expect(resultado).not.toContain('Lançamento Original');
      expect(resultado).toContain('💰 Por: *R$ 1.799,00*');
      expect(resultado).toContain('_(À vista no Pix ou 10x sem juros)_');
      expect(resultado).toContain('🛒 *Compre aqui:* https://amzn.to/exemplo123');
    });

    test('aplica trava anti-confusão para acessórios (cabo/suporte)', async () => {
      const input = {
        titulo: 'Cabo De Upgrade 8 Núcleos Prata Pura Pino C Para Fone De Ouvido Retorno De Palco Kz Zsn Pro Edx Zs10 Pro Original Envio Imediato',
        preco: 'R$ 34,90',
        link: 'https://s.shopee.com.br/exemplo456',
        detalhes: ''
      };

      const resultado = await formatarOfertaComIA(input);

      expect(resultado).toContain('Cabo');
      expect(resultado).toContain('💰 Por: *R$ 34,90*');
      expect(resultado).toContain('🛒 *Compre aqui:* https://s.shopee.com.br/exemplo456');
    });

    test('possui o systemInstruction exato com as regras de ouro', () => {
      expect(FORMATTER_SYSTEM_INSTRUCTION).toContain('GANCHO: 2 a 4 palavras em MAIÚSCULAS no topo');
      expect(FORMATTER_SYSTEM_INSTRUCTION).toContain('PRODUTO: Estruturado exatamente como');
      expect(FORMATTER_SYSTEM_INSTRUCTION).toContain('TRAVA ANTI-CONFUSÃO');
      expect(FORMATTER_SYSTEM_INSTRUCTION).toContain('LIMPEZA DE SEO');
      expect(FORMATTER_SYSTEM_INSTRUCTION).toContain('SILÊNCIO ABSOLUTO');
    });
  });

  describe('gerarBuscasComIA', () => {
    test('retorna 15 termos de busca específicos (Marca + Modelo)', async () => {
      const termos = await gerarBuscasComIA();

      expect(Array.isArray(termos)).toBe(true);
      expect(termos.length).toBe(15);
      // Verifica que não são palavras genéricas sozinhas
      termos.forEach(termo => {
        expect(typeof termo).toBe('string');
        expect(termo.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
      });
      expect(termos).toContain('Ryzen 7 5700X');
      expect(termos).toContain('Placa de Vídeo RTX 4060');
    });
  });
});

