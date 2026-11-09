'use strict';
const express = require('express');
const router = express.Router();
const logger = require('../config/logger');
const questionService = require('../questions/questionService');

/**
 * ==============================================================================
 * ROTA DE WEBHOOKS EM TEMPO REAL DO MERCADO LIVRE
 * ==============================================================================
 * Requisito: Responder HTTP 200 IMEDIATAMENTE ao Mercado Livre para evitar
 * bloqueios ou reenvios em loop. O processamento ocorre de forma assíncrona.
 * ==============================================================================
 */

router.post('/', (req, res) => {
  // 1. Responde 200 OK imediatamente para a API do Mercado Livre
  res.status(200).send('OK');

  const notification = req.body;
  if (!notification || !notification.topic) return;

  logger.info(`[Webhook] Notificação recebida do Mercado Livre: Tópico "${notification.topic}" | Recurso: "${notification.resource}"`);

  // 2. Processa assincronamente em segundo plano
  setImmediate(async () => {
    try {
      if (notification.topic === 'questions') {
        await questionService.processQuestion(notification.resource);
      }
    } catch (err) {
      logger.error(`[Webhook] Erro no processamento assíncrono: ${err.message}`);
    }
  });
});

module.exports = router;
