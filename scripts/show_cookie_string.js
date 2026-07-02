
const fs = require('fs');
const path = require('path');

const cookiesPath = path.resolve(__dirname, '../.ml_cookies.json');

function showCookieString() {
  if (!fs.existsSync(cookiesPath)) {
    console.error('❌ O arquivo .ml_cookies.json não existe.');
    console.log('Execute primeiro o script para salvar os cookies:\n  node scripts/auto_save_cookies.js');
    process.exit(1);
  }

  try {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    console.log('\n========================================================================');
    console.log('📋 COPIE A LINHA ABAIXO PARA A VARIÁVEL "ML_COOKIE_STRING" NO RENDER:');
    console.log('========================================================================\n');
    console.log(cookieHeader);
    console.log('\n========================================================================\n');
  } catch (e) {
    console.error('❌ Erro ao ler ou analisar o arquivo de cookies:', e.message);
  }
}

showCookieString();
