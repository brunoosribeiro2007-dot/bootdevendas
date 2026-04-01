const puppeteer = require('puppeteer');
const logger = require('../config/logger');

class ScraperService {
    async searchWithBrowser(keyword) {
        logger.info(`Iniciando busca via navegador para: ${keyword}`);
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new', // Modo mais eficiente
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Crítico para Docker
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process' // Mantém o Chrome em um único processo
                ]
            });
            const page = await browser.newPage();
            
            // Simular um navegador real
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(keyword)}_OrderId_items_sold_desc`;
            logger.info(`Navegando para busca top de vendas: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Rolar um pouco para baixo para carregar as imagens (lazy load)
            await page.evaluate(async () => {
                await new Promise(resolve => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= 1000) { // Rola só o topo
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });

            // Extrair produtos com Múltiplos Seletores para Robustez
            const products = await page.evaluate(() => {
                const results = [];
                // Tenta todos os seletores de contêiner conhecidos
                const items = document.querySelectorAll('.poly-card, .ui-search-result, .ui-search-result__wrapper, .ui-search-layout__item');
                
                items.forEach((item, index) => {
                    if (results.length >= 10) return; 
                    
                    // Tenta seletores de TÍTULO
                    const titleEl = item.querySelector('.poly-component__title, .ui-search-item__title, h2, .ui-search-link');
                    // Tenta seletores de PREÇO
                    const priceEl = item.querySelector('.poly-price__current .andes-money-amount__fraction, .ui-search-price__part--number, .andes-money-amount__fraction');
                    // Tenta seletores de IMAGEM
                    const imgEl = item.querySelector('.poly-component__picture img, .ui-search-result-image__element, img[src*="http"]');

                    if (titleEl && priceEl) {
                        const title = titleEl.innerText.trim();
                        const link = (titleEl.tagName === 'A' ? titleEl.href : item.querySelector('a')?.href) || '';
                        
                        let priceStr = priceEl.innerText.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
                        let price = parseFloat(priceStr);

                        let imageUrl = '';
                        if (imgEl) {
                            imageUrl = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('srcset')?.split(' ')[0] || '';
                        }

                        if (title && price > 0 && link && imageUrl) {
                            // Gerar um ID único baseado no Link ou ID do ML
                            const idMatch = link.match(/MLB-?(\d+)/i);
                            const id = idMatch ? `MLB${idMatch[1]}` : `T${Date.now()}${index}`;
                            
                            // Evitar duplicados na mesma busca
                            if (!results.find(r => r.id === id)) {
                                results.push({ id, title, price, link, thumbnail: imageUrl });
                            }
                        }
                    }
                });
                return results;
            });

            logger.info(`Busca via navegador finalizada. Encontrados ${products.length} produtos.`);
            return products;
        } catch (error) {
            logger.error(`Erro no Scraper via Navegador: ${error.message}`);
            return [];
        } finally {
            if (browser) await browser.close();
        }
    }
}

module.exports = new ScraperService();
