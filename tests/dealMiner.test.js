const axios = require('axios');
const {
  buscarMelhorOfertaML,
  executarCicloDeGarimpo,
  extrairProdutoAmazon,
  sentProductIds,
  applyMlAffiliateParams,
  convertToHighResImage
} = require('../src/services/dealMiner.service');

jest.mock('axios');

describe('DealMinerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sentProductIds.clear();
  });

  describe('applyMlAffiliateParams & convertToHighResImage', () => {
    test('adiciona matt_tool no link do Mercado Livre', () => {
      const linkOriginal = 'https://www.mercadolivre.com.br/produto-teste/p/MLB123';
      const linkAfiliado = applyMlAffiliateParams(linkOriginal);

      expect(linkAfiliado).toContain('matt_tool=');
    });

    test('converte imagem thumbnail -I para -O de alta resolução', () => {
      const thumb = 'http://http2.mlstatic.com/D_NQ_NP_983637-MLB74786438234-I.jpg';
      const highRes = convertToHighResImage(thumb);

      expect(highRes).toBe('https://http2.mlstatic.com/D_NQ_NP_983637-MLB74786438234-O.jpg');
    });
  });

  describe('buscarMelhorOfertaML', () => {
    test('seleciona o item com maior desconto real (>= 15%) e ignora itens sem desconto', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 'MLB001',
              title: 'Produto Sem Desconto',
              price: 100,
              original_price: null,
              thumbnail: 'http://img.com/1-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB001'
            },
            {
              id: 'MLB002',
              title: 'Produto Desconto Pequeno 10%',
              price: 90,
              original_price: 100,
              thumbnail: 'http://img.com/2-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB002'
            },
            {
              id: 'MLB003',
              title: 'Produto Desconto Alto 30%',
              price: 700,
              original_price: 1000,
              thumbnail: 'http://img.com/3-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB003',
              installments: { rate: 0, quantity: 10, amount: 70 },
              shipping: { free_shipping: true }
            },
            {
              id: 'MLB004',
              title: 'Produto Desconto Medio 20%',
              price: 80,
              original_price: 100,
              thumbnail: 'http://img.com/4-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB004'
            }
          ]
        }
      });

      const oferta = await buscarMelhorOfertaML('RTX 4060');

      expect(oferta).not.toBeNull();
      expect(oferta.id).toBe('MLB003');
      expect(oferta.desconto).toBe('30%');
      expect(oferta.detalhes).toContain('30% OFF');
      expect(oferta.detalhes).toContain('10x de R$ 70,00 sem juros');
      expect(oferta.detalhes).toContain('Frete Grátis');
      expect(oferta.link).toContain('matt_tool=');
      expect(oferta.imagem).toBe('https://img.com/3-O.jpg');
      expect(sentProductIds.has('MLB003')).toBe(true);
    });

    test('não repete o mesmo produto no mesmo dia via Set em memória', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              id: 'MLB100',
              title: 'Monitor 144Hz IPS',
              price: 700,
              original_price: 1000,
              thumbnail: 'http://img.com/100-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB100'
            }
          ]
        }
      });

      const primeira = await buscarMelhorOfertaML('Monitor 144Hz');
      expect(primeira).not.toBeNull();
      expect(primeira.id).toBe('MLB100');

      // Segunda chamada com mesmo ID nos resultados
      const segunda = await buscarMelhorOfertaML('Monitor 144Hz');
      expect(segunda).toBeNull(); // Deve ser ignorado pois já está no Set
    });

    test('rejeita suporte de controle que tenta se passar por console (trava anti-acessório)', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 'MLB_SUPORTE',
              title: 'Suporte Duplo Para Controles De Ps5 Ps4 Porta Base Dualsense',
              price: 22.90,
              original_price: 78.00,
              thumbnail: 'http://img.com/sup-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB_SUPORTE'
            }
          ]
        }
      });

      const oferta = await buscarMelhorOfertaML('Controle PS5');
      expect(oferta).toBeNull();
    });
  });

  describe('extrairProdutoAmazon', () => {
    test('extrai ASIN, título, preço e link oficial com tag de afiliado via Cheerio', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <body>
            <span id="productTitle">Placa de Vídeo RTX 4060 Galax 8GB GDDR6</span>
            <span class="a-price"><span class="a-offscreen">R$ 1.999,00</span></span>
            <img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/71xyz.jpg" src="https://m.media-amazon.com/images/I/71low.jpg" />
            <div id="installmentCalculator_feature_div">em até 10x de R$ 199,90 sem juros</div>
          </body>
        </html>
      `;

      axios.get.mockResolvedValueOnce({
        status: 200,
        data: mockHtml,
        config: { url: 'https://www.amazon.com.br/dp/B0D1234567' },
        request: { res: { responseUrl: 'https://www.amazon.com.br/dp/B0D1234567' } }
      });

      process.env.AMAZON_PARTNER_TAG = 'meubot-20';
      const produto = await extrairProdutoAmazon('https://amzn.to/3xyz');

      expect(produto).not.toBeNull();
      expect(produto.asin).toBe('B0D1234567');
      expect(produto.titulo).toBe('Placa de Vídeo RTX 4060 Galax 8GB GDDR6');
      expect(produto.preco).toBe('R$ 1.999,00');
      expect(produto.imagem).toBe('https://m.media-amazon.com/images/I/71xyz.jpg');
      expect(produto.link).toBe('https://www.amazon.com.br/dp/B0D1234567?tag=meubot-20');
      expect(produto.detalhes).toContain('sem juros');
    });

    test('trata erros de requisição graciosamente sem estourar exceção', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network Timeout'));

      const produto = await extrairProdutoAmazon('https://amzn.to/erro');
      expect(produto).toBeNull();
    });
  });

  describe('executarCicloDeGarimpo', () => {
    test('executa o ciclo completo retornando lista de ofertas prontas', async () => {
      axios.get.mockResolvedValue({
        data: {
          results: [
            {
              id: 'MLB777',
              title: 'Processador AMD Ryzen 7 5700X Octa-Core',
              price: 990,
              original_price: 1300,
              thumbnail: 'http://img.com/ryzen-I.jpg',
              permalink: 'https://produto.mercadolivre.com.br/MLB777'
            }
          ]
        }
      });

      const ofertas = await executarCicloDeGarimpo({ limite: 1 });
      expect(Array.isArray(ofertas)).toBe(true);
      expect(ofertas.length).toBe(1);
      expect(ofertas[0].produto.id).toBe('MLB777');
      expect(ofertas[0].mensagemFormatada).toContain('Ryzen 7 5700X');
    });
  });
});
