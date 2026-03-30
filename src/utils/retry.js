const logger = require('../config/logger');

const withRetry = async (fn, retries = 3, backoff = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }
    logger.warn(`Operação falhou, tentando novamente em ${backoff}ms... Retentativas restantes: ${retries - 1}. Erro: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, backoff));
    return withRetry(fn, retries - 1, backoff * 2);
  }
};

module.exports = { withRetry };
