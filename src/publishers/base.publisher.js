class BasePublisher {
  /**
   * Método principal para publicar a mensagem.
   * Deve ser implementado pelas classes filhas.
   * @param {Object} item Item da fila contendo a mensagem a ser publicada.
   * @returns {Promise<boolean>} Sucesso ou falha da publicação.
   */
  async publish(item) {
    throw new Error('Method "publish" must be implemented.');
  }
}

module.exports = BasePublisher;
