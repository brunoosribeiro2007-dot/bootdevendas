'use strict';
const request = require('supertest');
const app = require('../src/app');
const tokenManager = require('../src/auth/tokenManager');

describe('OAuth 2.0 & Webhook Integration Tests', () => {
  it('GET /auth/login deve redirecionar para a URL oficial do Mercado Livre', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('auth.mercadolivre.com.br/authorization');
    expect(res.headers.location).toContain('client_id=1426096167919533');
    expect(res.headers.location).toContain('response_type=code');
  });

  it('GET /auth/status deve retornar metadados seguros sem expor tokens', async () => {
    const res = await request(app).get('/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('authenticated');
    expect(res.body.data).not.toHaveProperty('access_token');
    expect(res.body.data).not.toHaveProperty('refresh_token');
  });

  it('POST /webhook deve responder 200 OK imediatamente', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({
        topic: 'questions',
        resource: '/questions/123456789',
        user_id: 1426096167919533
      });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('tokenManager.getAuthorizationUrl() deve gerar URL válida com HTTPS', () => {
    const url = tokenManager.getAuthorizationUrl();
    expect(url.startsWith('https://auth.mercadolivre.com.br/authorization')).toBe(true);
    expect(url).toContain('redirect_uri=');
  });
});
