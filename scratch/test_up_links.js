const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

let cookieHeader = process.env.ML_COOKIE_STRING || '';
const cookiesFile = path.resolve(process.cwd(), '.ml_cookies.json');
if (!cookieHeader && fs.existsSync(cookiesFile)) {
  const cookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
  cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
}
cookieHeader = cookieHeader.replace(/[^\x20-\x7E]/g, '').trim();

const tag = process.env.ML_AFFILIATE_TAG || 'bv20260330080614';
const apiUrl = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';

async function getCsrfToken() {
  const csrfMatch = cookieHeader.match(/_csrf=([^;\s]+)/);
  let cachedCsrf = csrfMatch ? csrfMatch[1] : null;
  try {
    const portalRes = await axios.get('https://www.mercadolivre.com.br/l/afiliados-home', {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,*/*'
      },
      timeout: 8000
    });
    const $ = cheerio.load(portalRes.data);
    let csrf = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val();
    if (!csrf) {
      const m = portalRes.data.match(/"csrfToken"\s*:\s*"([^"]+)"/);
      if (m) csrf = m[1];
    }
    if (csrf) cachedCsrf = csrf;
  } catch (e) {
  }
  return cachedCsrf;
}

async function testUrl(url) {
  try {
    const csrf = await getCsrfToken();
    const headers = {
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.mercadolivre.com.br',
      'Referer': 'https://www.mercadolivre.com.br/l/afiliados-home'
    };
    if (csrf) headers['x-csrf-token'] = csrf;

    const apiRes = await axios.post(apiUrl, { urls: [url], tag }, { headers, timeout: 8000 });
    console.log(`URL: ${url}`);
    console.log(`Response:`, JSON.stringify(apiRes.data));
  } catch (e) {
    console.log(`URL: ${url}`);
    console.log(`Error: ${e.message}`);
    if (e.response && e.response.data) {
      console.log(`Error response:`, JSON.stringify(e.response.data));
    }
  }
}

async function run() {
  // Test /up/ format
  console.log('--- Testing /up/ format ---');
  await testUrl('https://www.mercadolivre.com.br/mesa-redonda-madeira-macica-4-lugares-torneada-105cm-norah/up/MLBU3815630240');

  // Test /p/ format with MLM/MLB ID
  console.log('\n--- Testing /p/ format ---');
  await testUrl('https://www.mercadolivre.com.br/p/MLB4485912455');

  // Test produto.mercadolivre.com.br format
  console.log('\n--- Testing produto.mercadolivre.com.br format ---');
  await testUrl('https://produto.mercadolivre.com.br/MLB-4485912455');
  
  // Test produto.mercadolivre.com.br with dummy title
  console.log('\n--- Testing produto.mercadolivre.com.br format with title ---');
  await testUrl('https://produto.mercadolivre.com.br/MLB-4485912455-produto-teste');
}

run();
