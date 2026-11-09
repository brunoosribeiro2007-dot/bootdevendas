'use strict';
const express = require('express');
const router = express.Router();
const tokenManager = require('./tokenManager');
const repository = require('../database/repository');
const logger = require('../config/logger');

/**
 * ==============================================================================
 * ROTAS DE AUTENTICAÇÃO OAUTH 2.0 (MERCADO LIVRE)
 * ==============================================================================
 */

// GET /auth/login -> Redireciona para tela de consentimento oficial do ML
router.get('/login', (req, res) => {
  const authUrl = tokenManager.getAuthorizationUrl();
  logger.info('[AuthRoutes] Redirecionando usuário para consentimento do Mercado Livre.');
  res.redirect(authUrl);
});

// GET /auth/callback -> Recebe o code e troca por tokens no backend
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    logger.warn(`[AuthRoutes] Autorização negada: ${error} - ${error_description || ''}`);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Autorização Não Concedida</title></head>
      <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#0f172a; color:#f8fafc;">
        <h2 style="color:#ef4444;">❌ Autorização Não Concedida</h2>
        <p>Motivo: ${error_description || error}</p>
        <p><a href="/auth/login" style="color:#38bdf8;">Tentar novamente</a></p>
      </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).json({ success: false, message: 'Parâmetro "code" não informado.' });
  }

  try {
    await tokenManager.exchangeCodeForTokens(code);

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Autenticado com Sucesso</title></head>
      <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#0f172a; color:#f8fafc;">
        <div style="background:#1e293b; max-width:520px; margin:auto; padding:32px; border-radius:12px; border:1px solid #334155; box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <h2 style="color:#10b981;">✅ Conectado com Sucesso ao Mercado Livre!</h2>
          <p style="color:#94a3b8; font-size:15px;">Os tokens OAuth 2.0 foram armazenados com segurança. As buscas de produtos e o bot de atendimento agora usam autenticação oficial.</p>
          <div style="margin-top:24px;">
            <a href="/auth/status" style="display:inline-block; padding:10px 20px; background:#3b82f6; color:#fff; text-decoration:none; border-radius:6px; font-weight:600;">Ver Status da Conexão</a>
            <a href="/qr" style="display:inline-block; margin-left:10px; padding:10px 20px; background:#334155; color:#fff; text-decoration:none; border-radius:6px; font-weight:600;">Ir para o Painel</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Erro na Autenticação</title></head>
      <body style="font-family:sans-serif; text-align:center; padding-top:50px; background:#0f172a; color:#f8fafc;">
        <h2 style="color:#ef4444;">❌ Falha na Troca de Tokens</h2>
        <p>${err.message}</p>
        <p><a href="/auth/login" style="color:#38bdf8;">Tentar novamente</a></p>
      </body>
      </html>
    `);
  }
});

// GET /auth/status -> Retorna dados de integridade e tempo restante (sem expor o token)
router.get('/status', async (req, res) => {
  const status = await repository.getSafeOAuthStatus();
  res.json({ success: true, data: status });
});

// POST /auth/refresh -> Força renovação manual
router.post('/refresh', async (req, res) => {
  const success = await tokenManager.refreshAccessToken();
  const status = await repository.getSafeOAuthStatus();
  res.json({ success, status });
});

module.exports = router;
