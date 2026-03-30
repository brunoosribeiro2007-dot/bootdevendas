const BasePublisher = require('./base.publisher');
const logger = require('../config/logger');

class ConsolePublisher extends BasePublisher {
  async publish(item) {
    try {
      logger.info('Publicando item (Console Publisher):');
      console.log('--------------------------------------------------');
      console.log(item.formatted_message);
      console.log('--------------------------------------------------');
      return true;
    } catch (error) {
      logger.error('Erro no ConsolePublisher:', error);
      return false;
    }
  }
}

module.exports = new ConsolePublisher();
