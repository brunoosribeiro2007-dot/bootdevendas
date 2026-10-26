/**
 * ==============================================================================
 * WATERMARK SERVICE - APLICAÇÃO DE MARCA D'ÁGUA EM IMAGENS
 * ==============================================================================
 * Responsabilidades:
 * 1. Baixar a imagem original do produto em memória (Buffer).
 * 2. Garantir a existência do diretório assets/ e da marca d'água (watermark.png).
 * 3. Gerar selo placeholder automático caso o usuário ainda não tenha inserido a sua logo.
 * 4. Redimensionar e sobrepor a marca d'água na parte superior central da foto.
 * 5. Retornar Buffer e Base64 prontos para envio no WhatsApp ou pré-visualização.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const env = require('../config/env');
const logger = require('../config/logger');

class WatermarkService {
  constructor() {
    this.assetsDir = path.resolve(process.cwd(), 'assets');
    this.watermarkPath = env.watermarkPath
      ? path.resolve(process.cwd(), env.watermarkPath)
      : path.join(this.assetsDir, 'watermark.png');

    // Inicializa a pasta de assets e garante que a marca d'água exista
    this.ensureWatermarkExists().catch(err => {
      logger.warn(`[WatermarkService] Aviso na inicialização de assets: ${err.message}`);
    });
  }

  /**
   * Garante que o diretório assets/ e o arquivo watermark.png existam.
   * Se watermark.png não existir, gera um selo transparente moderno em formato SVG/PNG.
   */
  async ensureWatermarkExists() {
    try {
      if (!fs.existsSync(this.assetsDir)) {
        fs.mkdirSync(this.assetsDir, { recursive: true });
        logger.info(`[WatermarkService] Diretório criado: ${this.assetsDir}`);
      }

      if (!fs.existsSync(this.watermarkPath)) {
        logger.info('[WatermarkService] watermark.png não encontrado. Gerando selo placeholder transparente...');
        await this.generatePlaceholderWatermark(this.watermarkPath);
        logger.info(`[WatermarkService] Selo placeholder criado com sucesso em: ${this.watermarkPath}`);
      }
    } catch (e) {
      logger.error(`[WatermarkService] Erro ao assegurar marca d'água: ${e.message}`);
    }
  }

  /**
   * Gera uma marca d'água placeholder profissional (etiqueta transparente estilizada).
   * @param {string} targetPath - Caminho de destino para salvar a imagem PNG.
   */
  async generatePlaceholderWatermark(targetPath) {
    const svgBadge = `
      <svg width="450" height="90" viewBox="0 0 450 90" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#ffe600;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#ff9900;stop-opacity:1" />
          </linearGradient>
          <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.5" />
          </filter>
        </defs>
        <!-- Fundo com cantos arredondados e borda -->
        <rect x="5" y="5" width="440" height="80" rx="20" fill="#0f172a" opacity="0.92" stroke="url(#grad)" stroke-width="3" filter="url(#shadow)" />
        
        <!-- Ícone de Fogo e Texto Promocional -->
        <text x="35" y="54" font-family="Arial, Helvetica, sans-serif" font-size="34">🔥</text>
        <text x="85" y="44" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="url(#grad)" letter-spacing="1.5">
          OFERTA EXCLUSIVA
        </text>
        <text x="85" y="68" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#ffffff" letter-spacing="0.8">
          MELHOR PREÇO VERIFICADO
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svgBadge))
      .png()
      .toFile(targetPath);
  }

  /**
   * Converte uma entrada de imagem (URL, Buffer ou Caminho Local) para Buffer.
   * @param {string|Buffer} imageInput
   * @returns {Promise<Buffer>}
   */
  async resolveImageBuffer(imageInput) {
    if (Buffer.isBuffer(imageInput)) {
      return imageInput;
    }

    if (typeof imageInput === 'string' && imageInput.startsWith('http')) {
      logger.info(`[WatermarkService] Baixando imagem original da URL: ${imageInput.substring(0, 70)}...`);
      const response = await axios.get(imageInput, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      return Buffer.from(response.data);
    }

    if (typeof imageInput === 'string' && fs.existsSync(imageInput)) {
      return fs.readFileSync(imageInput);
    }

    throw new Error('Entrada de imagem inválida para marca d’água (deve ser URL, Buffer ou caminho de arquivo).');
  }

  /**
   * Aplica a marca d'água na parte superior central da imagem do produto.
   * 
   * @param {string|Buffer} imageInput - URL da imagem ou Buffer da imagem original.
   * @param {Object} options - Opções de customização (posição, escala, etc.).
   * @returns {Promise<{ buffer: Buffer, base64: string, mimeType: string, width: number, height: number }>}
   */
  async applyWatermark(imageInput, options = {}) {
    let originalBuffer = null;
    try {
      // 1. Obtém buffer da imagem base
      originalBuffer = await this.resolveImageBuffer(imageInput);

      // 2. Garante que o arquivo da marca d'água exista
      await this.ensureWatermarkExists();

      if (!fs.existsSync(this.watermarkPath)) {
        logger.warn('[WatermarkService] Marca d’água não disponível. Retornando imagem original.');
        return {
          buffer: originalBuffer,
          base64: `data:image/jpeg;base64,${originalBuffer.toString('base64')}`,
          mimeType: 'image/jpeg'
        };
      }

      // 3. Lê metadados da imagem base (largura e altura)
      const baseSharp = sharp(originalBuffer);
      const baseMeta = await baseSharp.metadata();
      const baseWidth = baseMeta.width || 800;
      const baseHeight = baseMeta.height || 800;

      // 4. Calcula dimensões da marca d'água proporcionalmente à imagem base
      // Largura da marca d'água: ~45% da largura da imagem original (entre 180px e 650px)
      const targetWatermarkWidth = Math.min(650, Math.max(180, Math.round(baseWidth * 0.45)));

      const watermarkBuffer = await sharp(this.watermarkPath)
        .resize({ width: targetWatermarkWidth, fit: 'inside' })
        .toBuffer();

      const watermarkMeta = await sharp(watermarkBuffer).metadata();
      const watermarkWidth = watermarkMeta.width;
      const watermarkHeight = watermarkMeta.height;

      // 5. Posicionamento na parte superior central com 4% de margem do topo
      const top = Math.max(10, Math.round(baseHeight * 0.04));
      const left = Math.max(0, Math.round((baseWidth - watermarkWidth) / 2));

      logger.info(`[WatermarkService] Sobrepondo marca d'água: pos(${left}, ${top}) tamanho(${watermarkWidth}x${watermarkHeight}) na imagem (${baseWidth}x${baseHeight})`);

      // 6. Faz o composite da marca d'água na imagem original
      const outputBuffer = await sharp(originalBuffer)
        .composite([
          {
            input: watermarkBuffer,
            top: top,
            left: left
          }
        ])
        .jpeg({ quality: 90 })
        .toBuffer();

      return {
        buffer: outputBuffer,
        base64: `data:image/jpeg;base64,${outputBuffer.toString('base64')}`,
        mimeType: 'image/jpeg',
        width: baseWidth,
        height: baseHeight
      };

    } catch (error) {
      logger.error(`[WatermarkService] Falha ao aplicar marca d'água: ${error.message}. Retornando fallback seguro.`);
      // Fallback seguro: nunca quebra o envio caso sharp ou rede falhe
      const safeBuffer = originalBuffer || Buffer.from([]);
      return {
        buffer: safeBuffer,
        base64: safeBuffer.length ? `data:image/jpeg;base64,${safeBuffer.toString('base64')}` : '',
        mimeType: 'image/jpeg'
      };
    }
  }
}

module.exports = new WatermarkService();
