const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const itemUrl = 'https://produto.mercadolivre.com.br/MLB-4632890666-kit-10-cabides-infantil-acrilico-cristal-transparente-cava-_JM';
const cleanUrl = 'https://produto.mercadolivre.com.br/MLB-4632890666';
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

async function testPayloads() {
  try {
    const { token, cookie } = await getCsrfToken();
    console.log('CSRF Token:', token ? 'OK' : 'NÃO ENCONTRADO');

    const payloads = [
      { url: cleanUrl, tag },
      { url: cleanUrl },
      { urls: [itemUrl], tag },
      { urls: [cleanUrl], tag },
      { originalUrl: itemUrl, tag },
      { originalUrl: cleanUrl, tag },
      { link_url: itemUrl, tag },
      { url: itemUrl, subid: tag },
      { url: itemUrl, subId: tag },
      { url: itemUrl, source: "affiliate_program" }
    ];

    for (const p of payloads) {
      try {
        console.log('--- Testando:', JSON.stringify(p));
        const res = await axios.post('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink', p, {
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
        console.log('✅ SUCESSO! Resposta:', JSON.stringify(res.data));
        return;
      } catch (e) {
        console.log('❌ FALHOU:', e.response ? `${e.response.status} - ${JSON.stringify(e.response.data)}` : e.message);
      }
    }
  } catch (err) {
    console.error('Erro na preparação:', err.message);
  }
}

testPayloads();
