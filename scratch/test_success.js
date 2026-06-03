const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// Tênis da New Balance ou produto similar do Mercado Livre que provavelmente é de afiliado
const itemUrl = 'https://www.mercadolivre.com.br/tenis-new-balance-feminino-413v3/p/MLB27954932';
const tag = 'bv20260330080614';
const cookieHeader = process.env.ML_COOKIE_STRING;

async function getCsrfToken() {
  const res = await axios.get('https://www.mercadolivre.com.br/l/afiliados-home', {
    headers: {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
  });
  
  const $ = cheerio.load(res.data);
  let token = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val();
  if (!token) {
    const match = res.data.match(/"csrfToken"\s*:\s*"([^"]+)"/) || res.data.match(/"csrf"\s*:\s*"([^"]+)"/);
    if (match) token = match[1];
  }
  
  let currentCookie = cookieHeader;
  if (res.headers['set-cookie']) {
    const newCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    currentCookie = `${cookieHeader}; ${newCookies}`;
  }
  
  return { token, cookie: currentCookie };
}

async function testSuccess() {
  try {
    const { token, cookie } = await getCsrfToken();
    
    // Novo formato descoberto: { urls: [link], tag }
    const payload = {
      urls: [itemUrl],
      tag: tag
    };

    console.log('Enviando POST com payload de sucesso:', JSON.stringify(payload));
    
    const res = await axios.post('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink', payload, {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'x-csrf-token': token,
        'Origin': 'https://www.mercadolivre.com.br',
        'Referer': 'https://www.mercadolivre.com.br/l/afiliados-home'
      },
      timeout: 5000
    });
    
    console.log('✅ RESPOSTA DA API:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('❌ ERRO:', err.response ? `${err.response.status} - ${JSON.stringify(err.response.data)}` : err.message);
  }
}

testSuccess();
