const fs = require('fs');
const path = require('path');

const sourceFile = path.resolve(process.cwd(), 'scratch/new_cookie_string.txt');
const destFile = path.resolve(process.cwd(), '.ml_cookies.json');

function importCookies() {
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Source file not found: ${sourceFile}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(sourceFile, 'utf8').trim();
  if (!raw) {
    console.error('❌ Cookie string file is empty.');
    process.exit(1);
  }

  console.log('Parsing cookie string...');
  const parts = raw.split(';');
  const cookies = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    const equalsIdx = trimmed.indexOf('=');
    if (equalsIdx === -1) continue;

    const name = trimmed.substring(0, equalsIdx).trim();
    const value = trimmed.substring(equalsIdx + 1).trim();

    if (name && value) {
      cookies.push({
        name,
        value,
        domain: '.mercadolivre.com.br',
        path: '/'
      });
    }
  }

  if (cookies.length === 0) {
    console.error('❌ No valid cookies parsed.');
    process.exit(1);
  }

  fs.writeFileSync(destFile, JSON.stringify(cookies, null, 2));
  console.log(`✅ Successfully imported ${cookies.length} cookies into ${destFile}!`);
}

importCookies();
