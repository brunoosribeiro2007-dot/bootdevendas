class FormatterService {
  generateRawMessage(product) {
    return `Imagem: ${product.imageUrl}\nTítulo: ${product.title}\nDescrição: ${product.description}\nValor: R$ ${product.price.toFixed(2)}\nLink: ${product.link}`;
  }

  generateFormattedMessage(product) {
    return `🖼 ${product.imageUrl}\n📦 *${product.title}*\n📝 ${product.description}\n💰 R$ ${product.price.toFixed(2)}\n🔗 ${product.link}`;
  }
}

module.exports = new FormatterService();
