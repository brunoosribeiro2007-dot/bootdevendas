const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const queueController = require('../controllers/queue.controller');

// Products (Captura)
router.post('/products/capture', productController.triggerCapture);
router.get('/products', productController.listAll);

// Queue
router.get('/queue/pending', queueController.getPending);
router.get('/queue/status/:status', queueController.getByStatus);
router.patch('/queue/:id/approve', queueController.approveItem);
router.patch('/queue/:id/reject', queueController.rejectItem);
router.patch('/queue/:id/publish', queueController.markAsPublished);
router.patch('/queue/:id/reprocess', queueController.reprocessItem);

module.exports = router;
