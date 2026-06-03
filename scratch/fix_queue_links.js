/**
 * Corrige links TinyURL na fila - substitui por links meli.la oficiais
 * Busca todos os itens com status 'approved' que tenham links não-oficiais
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const dbPath = process.env.DB_PATH || './database.sqlite';
const db = new Database(dbPath);

// Carrega cookies frescos do arquivo ou do .env
let cookieHeader = process.env.ML_COOKIE_STRING || '';
const cookiesFile = path.resolve(process.cwd(), '.ml_cookies.json');
if (!cookieHeader && fs.existsSync(cookiesFile)) {
  const cookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
  cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
}
// Sanitiza: remove chars inválidos para headers HTTP
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
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8'
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
    console.log('   Aviso: não conseguiu buscar CSRF do portal, usando do cookie');
  }

  return cachedCsrf;
}

async function getMeliShortlink(productLink) {
  try {
    const baseLink = productLink.split('?')[0].split('#')[0];
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
    cachedCsrf = null; // Reseta o cache em caso de erro
  }
  return null;
}

async function main() {
  // Busca TODOS os itens com links não-oficiais (qualquer status)
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
    // Extrai o link original do produto da raw_message
    const linkMatch = row.raw_message && row.raw_message.match(/Link:\s*(https?:\/\/[^\s\n]+)/);
    if (!linkMatch) {
      // Tenta extrair da products table
      const product = db.prepare('SELECT link FROM products WHERE id=?').get(row.product_id);
      if (!product || !product.link) {
        console.log(`[${row.id}] ⚠️ ${row.product_id} - sem link disponível`);
        failed++;
        continue;
      }

      const shortlink = await getMeliShortlink(product.link);
      if (shortlink) {
        // Substitui qualquer link encurtado no formatted_message
        const newFormatted = row.formatted_message.replace(/https?:\/\/(tinyurl\.com|is\.gd|v\.gd)\/[^\s]+/g, shortlink);
        const newRaw = row.raw_message ? row.raw_message.replace(/https?:\/\/(tinyurl\.com|is\.gd|v\.gd)\/[^\s\n]+/g, shortlink) : row.raw_message;
        db.prepare('UPDATE queue SET formatted_message=?, raw_message=? WHERE id=?').run(newFormatted, newRaw, row.id);
        console.log(`[${row.id}] ✅ ${row.product_id} (${row.status}) → ${shortlink}`);
        fixed++;
      } else {
        console.log(`[${row.id}] ❌ ${row.product_id} - falha na API`);
        failed++;
      }
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    const productLink = linkMatch[1];
    console.log(`[${row.id}] 🔄 ${row.product_id} (${row.status})`);

    const shortlink = await getMeliShortlink(productLink);

    if (shortlink) {
      // Substitui o link encurtado antigo pelo novo meli.la
      const newFormatted = row.formatted_message.replace(/https?:\/\/(tinyurl\.com|is\.gd|v\.gd)\/[^\s]+/g, shortlink);
      const newRaw = row.raw_message.replace(/https?:\/\/(tinyurl\.com|is\.gd|v\.gd)\/[^\s\n]+/g, shortlink);
      db.prepare('UPDATE queue SET formatted_message=?, raw_message=? WHERE id=?').run(newFormatted, newRaw, row.id);
      console.log(`   ✅ → ${shortlink}`);
      fixed++;
    } else {
      console.log(`   ❌ Mantendo link original (API falhou)`);
      failed++;
    }

    // Pequeno delay
    await new Promise(r => setTimeout(r, 600));
  }

  // Resumo final
  const withTiny = db.prepare("SELECT COUNT(*) as total FROM queue WHERE formatted_message LIKE '%tinyurl%'").get();
  const withMeli = db.prepare("SELECT COUNT(*) as total FROM queue WHERE formatted_message LIKE '%meli.la%'").get();
  console.log(`\n📊 Resultado final:`);
  console.log(`   ✅ ${fixed} itens corrigidos para meli.la`);
  console.log(`   ❌ ${failed} falhas`);
  console.log(`   🔗 Total na fila com meli.la: ${withMeli.total}`);
  console.log(`   ⚠️  Ainda com TinyURL: ${withTiny.total}`);
  db.close();
}

main().catch(err => {
  console.error('Erro fatal:', err);
  db.close();
  process.exit(1);
});
