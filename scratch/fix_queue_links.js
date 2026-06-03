/**
 * Corrige TODOS os links não-oficiais na fila:
 * - tinyurl.com, is.gd, v.gd  → falhou no encurtamento
 * - ?matt_tool=...             → nunca gerou link meli.la
 * Substitui por links meli.la oficiais
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const dbPath = process.env.DB_PATH || './database.sqlite';
const db = new Database(dbPath);

// Carrega cookies frescos
let cookieHeader = null;
const cookiesFile = path.resolve(process.cwd(), '.ml_cookies.json');
if (fs.existsSync(cookiesFile)) {
  const cookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
  cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
}
if (!cookieHeader) {
  cookieHeader = process.env.ML_COOKIE_STRING || '';
}
cookieHeader = cookieHeader.replace(/[^\x20-\x7E]/g, '').trim();

const tag = process.env.ML_AFFILIATE_TAG || 'bv20260330080614';
const apiUrl = process.env.ML_AFFILIATE_API_URL || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';

// Cache do CSRF para não buscar toda vez
let cachedCsrf = null;

async function getCsrfToken() {
  if (cachedCsrf) return cachedCsrf;
  const csrfMatch = cookieHeader.match(/_csrf=([^;\s]+)/);
  if (csrfMatch) cachedCsrf = csrfMatch[1];
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
    // usa do cookie mesmo
  }
  return cachedCsrf;
}

async function getMeliShortlink(productLink) {
  // Garante que é um link real do ML (não tinyurl)
  const baseLink = productLink.split('?')[0].split('#')[0];
  if (!baseLink.includes('mercadolivre') && !baseLink.includes('mercadolibre')) {
    return null; // Não é link do ML
  }
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

    const apiRes = await axios.post(apiUrl, { urls: [baseLink], tag }, { headers, timeout: 8000 });
    if (apiRes.data && apiRes.data.urls && apiRes.data.urls[0] && apiRes.data.urls[0].short_url) {
      return apiRes.data.urls[0].short_url;
    }
    const match = JSON.stringify(apiRes.data).match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
    if (match) return match[0];
  } catch (e) {
    console.error(`   ❌ Erro API: ${e.message}`);
    cachedCsrf = null;
  }
  return null;
}

// Extrai o link original do ML da tabela products (fonte mais confiável)
function getProductLink(productId) {
  const product = db.prepare('SELECT link FROM products WHERE id=?').get(productId);
  return product ? product.link : null;
}

// Substitui qualquer link não-meli.la no texto por um novo shortlink
function replaceLink(text, oldLinkPatterns, newLink) {
  let result = text;
  // Troca links curtos (tinyurl, is.gd, v.gd)
  result = result.replace(/https?:\/\/(tinyurl\.com|is\.gd|v\.gd)\/[^\s\n]+/g, newLink);
  // Troca links longos com matt_tool
  result = result.replace(/https?:\/\/[^\s\n]*matt_tool=[^\s\n]*/g, newLink);
  return result;
}

async function main() {
  const rows = db.prepare(
    "SELECT id, product_id, status, formatted_message, raw_message FROM queue WHERE " +
    "formatted_message LIKE '%tinyurl.com%' OR " +
    "formatted_message LIKE '%is.gd%' OR " +
    "formatted_message LIKE '%v.gd%' OR " +
    "formatted_message LIKE '%matt_tool%'"
  ).all();

  console.log(`\n🔍 Encontrados ${rows.length} itens com links não-oficiais\n`);

  let fixed = 0;
  let failed = 0;

  for (const row of rows) {
    // SEMPRE usa o link da tabela products (URL original do ML, sem parâmetros)
    const productLink = getProductLink(row.product_id);

    if (!productLink) {
      console.log(`[${row.id}] ⚠️ ${row.product_id} - sem link na tabela products`);
      failed++;
      continue;
    }

    console.log(`[${row.id}] 🔄 ${row.product_id} (${row.status})`);

    const shortlink = await getMeliShortlink(productLink);

    if (shortlink) {
      const newFormatted = replaceLink(row.formatted_message, [], shortlink);
      const newRaw = row.raw_message ? replaceLink(row.raw_message, [], shortlink) : row.raw_message;

      db.prepare('UPDATE queue SET formatted_message=?, raw_message=? WHERE id=?')
        .run(newFormatted, newRaw, row.id);

      console.log(`   ✅ → ${shortlink}`);
      fixed++;
    } else {
      console.log(`   ❌ API falhou - link original mantido`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Resumo final
  const withTiny = db.prepare("SELECT COUNT(*) as total FROM queue WHERE formatted_message LIKE '%tinyurl%'").get();
  const withMatt = db.prepare("SELECT COUNT(*) as total FROM queue WHERE formatted_message LIKE '%matt_tool%'").get();
  const withMeli = db.prepare("SELECT COUNT(*) as total FROM queue WHERE formatted_message LIKE '%meli.la%'").get();

  console.log(`\n📊 Resultado final:`);
  console.log(`   ✅ ${fixed} itens corrigidos para meli.la`);
  console.log(`   ❌ ${failed} falhas`);
  console.log(`   🔗 Total com meli.la: ${withMeli.total}`);
  console.log(`   ⚠️  Ainda com TinyURL: ${withTiny.total}`);
  console.log(`   ⚠️  Ainda com matt_tool: ${withMatt.total}`);

  db.close();
}

main().catch(err => {
  console.error('Erro fatal:', err);
  db.close();
  process.exit(1);
});
