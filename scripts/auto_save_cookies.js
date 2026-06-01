const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const cookiesPath = path.resolve(__dirname, '../.ml_cookies.json');

(async () => {
  console.log('🚀 Iniciando navegador para login no Mercado Livre...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = (await browser.pages())[0] || await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  console.log('🌐 Navegando para a página oficial de Afiliados...');
  // Usando a URL oficial do portal no Brasil
  await page.goto('https://www.mercadolivre.com.br/l/afiliados-home', { waitUntil: 'load' });

  console.log('👉 Por favor, clique em "Entrar" (se não estiver logado) e faça o login no site.');
  console.log('Aguardando login...');

  const interval = setInterval(async () => {
    try {
      const url = page.url();
      
      // Apenas prossegue se a URL for válida e não for tela de login ou erro
      if ((url.includes('/afiliados') || url.includes('/affiliate-program')) && !url.includes('login') && !url.includes('msl_tx')) {
        const cookies = await page.cookies();
        
        // PROTETOR DE SESSÃO REAL: Garante que os cookies de autenticação privada existam
        // (Ao contrário do _csrf ou cp que existem para visitantes deslogados)
        const hasAuthSession = cookies.some(c => 
          c.name.includes('sid') || 
          c.name.includes('ssid') || 
          c.name.includes('msl_tx')
        );
        
        if (hasAuthSession) {
          console.log('✅ Login detectado com sucesso!');
          fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
          console.log(`💾 Cookies salvos com sucesso em: ${cookiesPath}`);
          clearInterval(interval);
          await browser.close();
          console.log('👋 Navegador fechado. O bot já está 100% pronto para gerar links meli.la!');
          process.exit(0);
        }
      }
    } catch (e) {
      clearInterval(interval);
    }
  }, 2000);

  // Monitora se o navegador foi fechado manualmente antes do login
  browser.on('disconnected', () => {
    clearInterval(interval);
    console.log('⚠️ Navegador foi fechado pelo usuário.');
    process.exit(1);
  });
})();
