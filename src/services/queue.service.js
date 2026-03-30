const repository = require('../database/repository');
const logger = require('../config/logger');

class QueueService {
  async addToQueue(product, rawMessage, formattedMessage) {
    try {
      const savedCount = await repository.saveProduct(product);
      if (savedCount === 0) {
        logger.debug(`Produto já existe no banco: ${product.id}`);
        return false;
      }

      const queueCount = await repository.enqueueProduct({
        productId: product.id,
        rawMessage,
        formattedMessage,
      });

      if (queueCount > 0) {
        logger.info(`Produto ${product.id} adicionado à fila.`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Erro ao adicionar à fila:', error);
      throw error;
    }
  }

  async getPendingQueue() {
    return await repository.getQueue('pending');
  }

  async getQueueByStatus(status) {
    return await repository.getQueue(status);
  }

  async getAllQueue() {
      return await repository.getQueue(null);
  }

  async setStatus(queueId, status) {
    const changes = await repository.updateQueueStatus(queueId, status);
    if (changes > 0) {
      logger.info(`Item da fila ${queueId} alterado para ${status}.`);
      return true;
    }
    return false;
  }
}

module.exports = new QueueService();
