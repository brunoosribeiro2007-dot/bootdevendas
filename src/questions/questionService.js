'use strict';
const axios = require('axios');
const logger = require('../config/logger');
const tokenManager = require('../auth/tokenManager');

/**
 * ==============================================================================
 * MÓDULO DE PERGUNTAS & RESPOSTAS AUTOMÁTICAS (PRÉ-VENDA)
 * ==============================================================================
 * 1. Consulta detalhes da pergunta recebida (GET /questions/{id}).
 * 2. Consulta dados do anúncio associado (GET /items/{id}) para contexto.
 * 3. Decide a resposta (regras simples ou fallback inteligente).
 * 4. Envia resposta oficial via POST /answers.
 * ==============================================================================
 */

class QuestionService {
  /**
   * Processa uma notificação de pergunta recebida via Webhook.
   * 
   * @param {string} resourcePath - Exemplo: "/questions/123456789"
   */
  async processQuestion(resourcePath) {
    if (!resourcePath) return;

    try {
      const accessToken = await tokenManager.getValidAccessToken();
      if (!accessToken) {
        logger.warn('[Q&A] ⚠️ Pergunta recebida, mas não há token OAuth válido. Acesse /auth/login.');
        return;
      }

      const questionId = resourcePath.replace(/\D/g, '');
      logger.info(`[Q&A] 📩 Consultando detalhes da pergunta ID: ${questionId}...`);

      // 1. Busca detalhes da pergunta
      const questionRes = await axios.get(`https://api.mercadolibre.com/questions/${questionId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      });

      const questionData = questionRes.data;

      // Se a pergunta já foi respondida ou cancelada, ignora
      if (questionData.status !== 'UNANSWERED') {
        logger.info(`[Q&A] Pergunta ${questionId} já está com status: ${questionData.status}. Ignorando.`);
        return;
      }

      const questionText = questionData.text || '';
      const itemId = questionData.item_id;

      logger.info(`[Q&A] Pergunta recebida: "${questionText}" para o anúncio ${itemId}`);

      // 2. Busca informações do anúncio para contexto
      let itemTitle = '';
      try {
        const itemRes = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          timeout: 8000
        });
        itemTitle = itemRes.data.title || '';
      } catch (itemErr) {
        logger.debug(`[Q&A] Não foi possível carregar detalhes do anúncio ${itemId}: ${itemErr.message}`);
      }

      // 3. Lógica modular de resposta
      const answerText = this.decideAnswer(questionText, itemTitle);

      // 4. Envia a resposta oficial
      await this.sendAnswer(questionId, answerText, accessToken);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      logger.error(`[Q&A] ❌ Erro ao processar pergunta ${resourcePath}: ${msg}`);
    }
  }

  /**
   * Motor de decisão para resposta automática (modular para regras ou IA)
   */
  decideAnswer(questionText, itemTitle = '') {
    const q = questionText.toLowerCase();

    // Regra 1: Disponibilidade / Pronta entrega / Estoque
    if (q.includes('tem estoque') || q.includes('disponivel') || q.includes('disponível') || q.includes('pronta entrega')) {
      return 'Olá! Sim, temos produto disponível a pronta entrega com envio imediato. Aguardamos sua compra! 😊';
    }

    // Regra 2: Originalidade / Nota Fiscal
    if (q.includes('original') || q.includes('nota fiscal') || q.includes('nf') || q.includes('garantia')) {
      return 'Olá! Sim, todos os nossos produtos são 100% originais, novos, lacrados na caixa e acompanham Nota Fiscal e garantia. Ficamos à disposição!';
    }

    // Regra 3: Envio / Prazo / Frete
    if (q.includes('envia hoje') || q.includes('despacha hoje') || q.includes('quando envia')) {
      return 'Olá! Compras confirmadas são despachadas com máxima agilidade através do envio expresso do Mercado Livre. Aguardamos seu pedido!';
    }

    // Fallback padrão amigável
    return `Olá! Agradecemos o interesse em "${itemTitle || 'nosso produto'}". Estamos conferindo sua dúvida e retornaremos o mais rápido possível!`;
  }

  /**
   * Envia a resposta via POST /answers
   */
  async sendAnswer(questionId, text, accessToken) {
    logger.info(`[Q&A] 📤 Enviando resposta oficial para pergunta ${questionId}...`);

    await axios.post('https://api.mercadolibre.com/answers', {
      question_id: parseInt(questionId, 10),
      text: text
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    logger.info(`[Q&A] ✅ Pergunta ${questionId} respondida com sucesso!`);
  }
}

module.exports = new QuestionService();

