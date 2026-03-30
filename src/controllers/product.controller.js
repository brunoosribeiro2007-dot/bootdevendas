const mlService = require('../services/mercadoLivre.service');
const queueService = require('../services/queue.service');
const formatterService = require('../services/formatter.service');

class ProductController {
  async triggerCapture(req, res) {
    try {
      const { keyword, category } = req.body;
      const term = keyword || req.app.get('env').mlSearchKeyword;
      const cat = category || req.app.get('env').mlCategory;

      const products = await mlService.searchProducts(term, cat);
      let count = 0;
      for (const p of products) {
        if (!p.title || !p.price || !p.link || !p.imageUrl) continue;
        const added = await queueService.addToQueue(
          p,
          formatterService.generateRawMessage(p),
          formatterService.generateFormattedMessage(p)
        );
        if (added) count++;
      }
      
      res.json({ success: true, message: `Captura concluída. ${count} itens enfileirados.` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async listAll(req, res) {
      try {
          const items = await queueService.getAllQueue();
          res.json({ success: true, items });
      } catch (error) {
          res.status(500).json({ success: false, error: error.message });
      }
  }
}

module.exports = new ProductController();
