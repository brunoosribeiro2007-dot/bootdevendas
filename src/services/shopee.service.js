const axios = require('axios');
const crypto = require('crypto');
const logger = require('../config/logger');
const env = require('../config/env');
const { isProductBlacklisted } = require('./mercadoLivre.service');

/**
 * Calculates signature for the Shopee Affiliate Open API (GraphQL)
 * Signature = SHA256(AppId + Timestamp + Payload + Secret)
 */
function calculateSignature(appId, timestamp, payload, secret) {
  const baseString = appId + timestamp + payload + secret;
  return crypto.createHash('sha256').update(baseString).digest('hex');
}

/**
 * Searches products on Shopee using the official Affiliate GraphQL API
 */
async function searchProducts(keyword) {
  if (!env.useShopee) {
    logger.debug('Shopee integration is disabled.');
    return [];
  }

  const appId = env.shopeeAppId;
  const secret = env.shopeeSecret;

  if (!appId || !secret) {
    logger.warn('⚠️ Shopee App ID or Secret not configured! Skipping Shopee search.');
    return [];
  }

  logger.info(`🔍 Buscando produtos na Shopee para: "${keyword}"...`);

  const query = `
    query getProductOffers($keyword: String, $page: Int, $limit: Int) {
      productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
        nodes {
          itemId
          shopId
          productName
          productLink
          imageUrl
          price
          priceMin
          priceMax
          priceDiscountRate
          sales
          ratingStar
        }
      }
    }
  `;

  const variables = {
    keyword: keyword,
    page: 1,
    limit: 30
  };

  const payloadStr = JSON.stringify({ query, variables });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = calculateSignature(appId, timestamp, payloadStr, secret);

  const url = 'https://open-api.affiliate.shopee.com.br/graphql';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
  };

  try {
    const response = await axios.post(url, payloadStr, { headers, timeout: 10000 });

    if (response.data && response.data.errors) {
      logger.error('❌ Erro retornado pela API da Shopee:', JSON.stringify(response.data.errors));
      return [];
    }

    const offerData = response.data?.data?.productOfferV2;
    if (!offerData || !offerData.nodes || offerData.nodes.length === 0) {
      logger.info(`ℹ️ Nenhum produto retornado pela Shopee para "${keyword}".`);
      return [];
    }

    const products = [];

    for (const item of offerData.nodes) {
      try {
        const title = item.productName;
        if (!title) continue;

        // 🛑 FILTRO DE NICHO (BLACKLIST)
        if (isProductBlacklisted(title)) {
          logger.debug(`⏩ Ignorando Shopee "${title}" por não ser do nicho Casa.`);
          continue;
        }

        // ⭐ FILTRO DE AVALIAÇÃO MINIMA (4.5 estrelas)
        const rating = item.ratingStar ? parseFloat(item.ratingStar) : null;
        if (rating !== null && rating < 4.5) {
          logger.debug(`⏩ Ignorando Shopee "${title}" por avaliação insuficiente: ${rating}`);
          continue;
        }

        // Tratamento de Preço
        let price = parseFloat(item.price || item.priceMin || 0);
        let oldPrice = parseFloat(item.priceMax || item.priceMin || price);

        if (price > 10000) price = price / 100000;
        if (oldPrice > 10000) oldPrice = oldPrice / 100000;

        if (!price) continue;

        // 🏷️ CÁLCULO DE DESCONTO REAL
        let discountPercent = 0;
        if (item.priceDiscountRate) {
          discountPercent = typeof item.priceDiscountRate === 'string'
            ? parseFloat(item.priceDiscountRate.replace('%', ''))
            : parseFloat(item.priceDiscountRate);
          if (discountPercent < 1) {
            discountPercent = Math.round(discountPercent * 100);
          }
        } else if (oldPrice && price < oldPrice) {
          discountPercent = Math.round(((oldPrice - price) / oldPrice) * 100);
        }

        // 🛑 FILTRO DE "OFERTA DE VERDADE" (mínimo de 15% de desconto)
        if (discountPercent < 15) {
          logger.debug(`⏩ Ignorando Shopee "${title}" por desconto baixo (${discountPercent}%).`);
          continue;
        }

        const id = `SP-${item.itemId}`;
        const link = item.productLink || `https://shopee.com.br/product/${item.shopId}/${item.itemId}`;

        products.push({
          id,
          title,
          price,
          oldPrice: oldPrice > price ? oldPrice : null,
          discountPercent,
          link,
          imageUrl: item.imageUrl,
          description: `Oferta (Shopee): ${keyword}`,
          rating: rating || 4.5,
          reviewsCount: item.sales || 100
        });

      } catch (itemErr) {
        logger.debug(`Erro ao processar item Shopee: ${itemErr.message}`);
      }
    }

    logger.info(`✅ Shopee busca com sucesso para "${keyword}" (${products.length} itens correspondentes).`);
    return products.slice(0, 10);

  } catch (error) {
    logger.error(`❌ Erro ao buscar produtos na Shopee para "${keyword}":`, error.message);
    return [];
  }
}

module.exports = {
  searchProducts
};
