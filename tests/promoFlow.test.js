const sharp = require('sharp');
const promoParser = require('../src/services/promoParser.service');
const watermarkService = require('../src/services/watermark.service');
const affiliateConverter = require('../src/services/affiliateConverter.service');
const postFormatter = require('../src/services/postFormatter.service');
const whatsappSender = require('../src/services/whatsappSender.service');
const env = require('../src/config/env');

describe('Fluxo Completo de Promoções Mercado Livre', () => {

  describe('1. Módulo promoParser', () => {
    test('extractMeliUrls deve extrair links meli.la e mercadolivre.com.br', () => {
      const text = 'Olha essa oferta incrível: https://meli.la/2bsigWb e também confira https://produto.mercadolivre.com.br/MLB-123456789-air-fryer-mondial-4l-_JM corram!';
      const urls = promoParser.extractMeliUrls(text);
      expect(urls.length).toBe(2);
      expect(urls[0]).toBe('https://meli.la/2bsigWb');
      expect(urls[1]).toContain('produto.mercadolivre.com.br/MLB-123456789-air-fryer-mondial-4l-_JM');
    });

    test('extractCouponCode deve extrair código de cupom com diferentes prefixos e emojis', () => {
      expect(promoParser.extractCouponCode('Compre agora com o cupom: CUPOM10OFF')).toBe('CUPOM10OFF');
      expect(promoParser.extractCouponCode('Use o cupom: *CASA50*')).toBe('CASA50');
      expect(promoParser.extractCouponCode('🎟️ Código: MELI20')).toBe('MELI20');
      expect(promoParser.extractCouponCode('🏷️ PROMO100 imperdível')).toBe('PROMO100');
    });

    test('extractCouponCode deve ignorar falsos positivos como OFF ou FRETE', () => {
      expect(promoParser.extractCouponCode('Aproveite 20% OFF no carrinho')).toBeNull();
      expect(promoParser.extractCouponCode('Frete grátis para todo o Brasil')).toBeNull();
    });

    test('cleanProductUrl deve remover query parameters de afiliados concorrentes', () => {
      const raw = 'https://www.mercadolivre.com.br/p/MLB12345?matt_tool=concorrente&tracking_id=xyz';
      const clean = promoParser.cleanProductUrl(raw);
      expect(clean).toBe('https://www.mercadolivre.com.br/p/MLB12345');
    });
  });

  describe('2. Módulo watermarkService', () => {
    test('ensureWatermarkExists deve gerar o placeholder watermark.png se não existir', async () => {
      await watermarkService.ensureWatermarkExists();
      const fs = require('fs');
      expect(fs.existsSync(watermarkService.watermarkPath)).toBe(true);
    });

    test('applyWatermark deve sobrepor marca d\'água em buffer de imagem sem erros', async () => {
      // Cria imagem teste de 600x600 em memória
      const sampleBaseBuffer = await sharp({
        create: {
          width: 600,
          height: 600,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).jpeg().toBuffer();

      const result = await watermarkService.applyWatermark(sampleBaseBuffer);
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.base64).toContain('data:image/jpeg;base64,');
      expect(result.width).toBe(600);
      expect(result.height).toBe(600);
    });
  });

  describe('3. Módulo affiliateConverter', () => {
    test('convertToAffiliateLink deve retornar fallback seguro com matt_tool em ambiente de teste', async () => {
      const rawUrl = 'https://www.mercadolivre.com.br/air-fryer-mondial/p/MLB123456';
      const link = await affiliateConverter.convertToAffiliateLink(rawUrl);
      expect(link).toContain('matt_tool=' + env.mlAffiliateTag);
      expect(link).toContain('https://www.mercadolivre.com.br/air-fryer-mondial/p/MLB123456');
    });
  });

  describe('4. Módulo postFormatter', () => {
    test('formatPost deve montar o template exato com cupom', async () => {
      const post = await postFormatter.formatPost({
        title: 'Fritadeira Sem Óleo Air Fryer Mondial 4L',
        price: 289.90,
        coupon: 'MONDIAL20',
        affiliateLink: 'https://meli.la/2xyz123',
        storeName: 'Oferta no Mercado Livre',
        customHeadline: 'AIR FRYER EM SUPER PROMOÇÃO'
      });

      expect(post).toContain('*AIR FRYER EM SUPER PROMOÇÃO*');
      expect(post).toContain('Fritadeira Sem Óleo Air Fryer Mondial 4L');
      expect(post).toContain('289,90');
      expect(post).toContain('MONDIAL20');
      expect(post).toContain('https://meli.la/2xyz123');
    });

    test('formatPost NÃO deve exibir a linha de cupom quando coupon não for fornecido', async () => {
      const post = await postFormatter.formatPost({
        title: 'Jogo de Panelas Tramontina 5 Peças',
        price: 150,
        coupon: null,
        affiliateLink: 'https://meli.la/panela123',
        customHeadline: 'JOGO DE PANELAS COMPLETO'
      });

      expect(post).not.toContain('Cupom');
      expect(post).toContain('150');
      expect(post).toContain('https://meli.la/panela123');
    });
  });

  describe('5. Módulo whatsappSender (Preview Pipeline)', () => {
    test('previewPromotion deve orquestrar todos os módulos e gerar payload completo com imagem base64', async () => {
      const sampleBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 240, g: 240, b: 240 }
        }
      }).jpeg().toBuffer();

      const preview = await whatsappSender.previewPromotion({
        url: 'https://www.mercadolivre.com.br/item-teste/p/MLB999',
        title: 'Cafeteira Espresso Nescafé Dolce Gusto',
        price: 399.90,
        imageUrl: sampleBuffer,
        coupon: 'CAFE10',
        customHeadline: 'CAFETEIRA PRA QUEM AMA CAFÉ'
      });

      expect(preview.success).toBe(true);
      expect(preview.caption).toContain('*CAFETEIRA PRA QUEM AMA CAFÉ*');
      expect(preview.caption).toContain('Cafeteira Espresso Nescafé Dolce Gusto');
      expect(preview.caption).toContain('399,90');
      expect(preview.caption).toContain('CAFE10');
      expect(preview.caption).toContain(preview.affiliateLink);
      expect(preview.imageBase64).toContain('data:image/jpeg;base64,');
    });
  });

});
