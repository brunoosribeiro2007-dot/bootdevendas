const queueService = require('../services/queue.service');

class QueueController {
  async getPending(req, res) {
    try {
      const items = await queueService.getPendingQueue();
      res.json({ success: true, items });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getByStatus(req, res) {
    try {
      const { status } = req.params;
      const items = await queueService.getQueueByStatus(status);
      res.json({ success: true, items });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async approveItem(req, res) {
    try {
      const { id } = req.params;
      const success = await queueService.setStatus(id, 'approved');
      if (success) res.json({ success: true, message: `Item ${id} aprovado para publicação.` });
      else res.status(404).json({ success: false, message: 'Item não encontrado.' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async rejectItem(req, res) {
    try {
      const { id } = req.params;
      const success = await queueService.setStatus(id, 'rejected');
      if (success) res.json({ success: true, message: `Item ${id} rejeitado.` });
      else res.status(404).json({ success: false, message: 'Item não encontrado.' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async markAsPublished(req, res) {
    try {
      const { id } = req.params;
      const success = await queueService.setStatus(id, 'published');
      if (success) res.json({ success: true, message: `Item ${id} marcado como publicado.` });
      else res.status(404).json({ success: false, message: 'Item não encontrado.' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async reprocessItem(req, res) {
      try {
          const { id } = req.params;
          const success = await queueService.setStatus(id, 'pending');
          if (success) res.json({ success: true, message: `Item ${id} reprocessado e enviado para pending.` });
          else res.status(404).json({ success: false, message: 'Item não encontrado.' });
      } catch (error) {
          res.status(500).json({ success: false, error: error.message });
      }
  }
}

module.exports = new QueueController();
