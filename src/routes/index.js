const express = require('express');
const router = express.Router();
const repository = require('../database/repository');
const { captureTask } = require('../jobs/capture.job');
const { publishTask } = require('../jobs/publisher.job');

// Listar fila
router.get('/queue', async (req, res) => {
    const status = req.query.status || 'approved';
    const items = await repository.getQueue(status);
    res.json(items);
});

// Forçar Captura Manual (Útil para testes)
router.get('/capture/force', async (req, res) => {
    res.json({ message: 'Captura iniciada em background. Acompanhe os Logs no Render!' });
    captureTask().catch(console.error);
});

// Forçar Publicação Manual
router.get('/publish/force', async (req, res) => {
    res.json({ message: 'Tentativa de publicação iniciada. Acompanhe os Logs!' });
    publishTask().catch(console.error);
});

module.exports = router;
