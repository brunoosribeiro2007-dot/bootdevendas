'use strict';
const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');
const repository = require('../database/repository');

/**
 * ==============================================================================
 * GERENCIADOR DE AUTENTICAÇÃO OAUTH 2.0 (INTEGRADO AO BOT DE AFILIADOS)
 * ==============================================================================
 * 1. Constrói a URL de consentimento oficial do Mercado Livre.
 * 2. Troca o código temporário (code) por access_token e refresh_token.
 * 3. Persiste tokens no banco de dados (Supabase / SQLite).
 * 4. Monitor de auto-refresh que renova preventivamente a cada 20 minutos.
 * ==============================================================================
 */

class TokenManager {
  constructor() {
    this.refreshInterval = null;
    this._isRefreshing = false;
  }

  /**
   * Constrói a URL oficial de autorização do Mercado Livre.
   */
  getAuthorizationUrl(state = null) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.mlClientId,
      redirect_uri: env.mlRedirectUri,
    });

    if (state) {
      params.append('state', state);
    }

    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  /**
   * Troca o código recebido no callback por tokens (Backend-Only)
   */
  async exchangeCodeForTokens(code) {
    if (!code || typeof code !== 'string') {
      throw new Error('[OAuth] Código de autorização inválido ou ausente.');
    }

    logger.info('[OAuth] 🔄 Trocando código de autorização por tokens na API do Mercado Livre...');

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.mlClientId,
      client_secret: env.mlClientSecret,
      code: code.trim(),
      redirect_uri: env.mlRedirectUri
    });

    try {
      const response = await axios.post('https://api.mercadolibre.com/oauth/token', payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'ML-AffiliateBot/1.0.0 (Node.js)'
        },
        timeout: 10000
      });

      const tokenData = response.data;

      await repository.saveOAuthTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        user_id: tokenData.user_id,
        scope: tokenData.scope,
        token_type: tokenData.token_type
      });

      logger.info(`[OAuth] ✅ Autenticação realizada com sucesso para o usuário ID: ${tokenData.user_id || 'OK'}`);
      return true;
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.response?.data?.error_description || err.message;
      logger.error(`[OAuth] ❌ Falha na troca de código: ${apiMsg}`);
      throw new Error(`Falha na autorização do Mercado Livre: ${apiMsg}`);
    }
  }

  /**
   * Renova o access_token utilizando o refresh_token salvo no banco.
   */
  async refreshAccessToken() {
    if (this._isRefreshing) {
      logger.debug('[OAuth] Renovação de token já em andamento. Aguardando...');
      return false;
    }

    const currentTokens = await repository.getOAuthTokens();
    if (!currentTokens || !currentTokens.refreshToken) {
      logger.debug('[OAuth] Nenhum refresh_token disponível no banco para renovação.');
      return false;
    }

    this._isRefreshing = true;
    logger.info('[OAuth] 🔄 Executando renovação de access_token via refresh_token...');

    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.mlClientId,
      client_secret: env.mlClientSecret,
      refresh_token: currentTokens.refreshToken
    });

    try {
      const response = await axios.post('https://api.mercadolibre.com/oauth/token', payload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'ML-AffiliateBot/1.0.0 (Node.js)'
        },
        timeout: 10000
      });

      const tokenData = response.data;

      await repository.saveOAuthTokens({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        user_id: tokenData.user_id || currentTokens.userId,
        scope: tokenData.scope,
        token_type: tokenData.token_type
      });

      logger.info('[OAuth] ✅ Token de acesso renovado com sucesso via refresh_token!');
      return true;
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.response?.data?.error_description || err.message;
      logger.warn(`[OAuth] ⚠️ Falha ao renovar token via refresh_token: ${apiMsg}`);
      return false;
    } finally {
      this._isRefreshing = false;
    }
  }

  /**
   * Retorna um access_token válido. Renova preventivamente se restar < 15 min.
   */
  async getValidAccessToken() {
    let tokens = await repository.getOAuthTokens();
    if (!tokens) return null;

    const now = Date.now();
    const fifteenMinutesMs = 15 * 60 * 1000;

    if (now >= (tokens.expiresAt - fifteenMinutesMs)) {
      logger.info('[OAuth] Token próximo da expiração (<15 min). Acionando refresh preventivo...');
      const success = await this.refreshAccessToken();
      if (success) {
        tokens = await repository.getOAuthTokens();
      }
    }

    return tokens ? tokens.accessToken : null;
  }

  /**
   * Monitor de auto-refresh em segundo plano a cada 20 minutos.
   */
  startAutoRefreshJob(intervalMinutes = 20) {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    logger.info(`[OAuth] Monitor de auto-refresh agendado (intervalo: ${intervalMinutes} minutos).`);

    this.refreshInterval = setInterval(async () => {
      try {
        const tokens = await repository.getOAuthTokens();
        if (!tokens) return;

        const now = Date.now();
        const thirtyMinutesMs = 30 * 60 * 1000;

        if (now >= (tokens.expiresAt - thirtyMinutesMs)) {
          logger.info('[OAuth] Auto-refresh job: Token expira em breve. Renovando...');
          await this.refreshAccessToken();
        }
      } catch (err) {
        logger.warn(`[OAuth] Erro no job de auto-refresh: ${err.message}`);
      }
    }, intervalMinutes * 60 * 1000);

    if (this.refreshInterval.unref) {
      this.refreshInterval.unref();
    }
  }

  stopAutoRefreshJob() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

module.exports = new TokenManager();
