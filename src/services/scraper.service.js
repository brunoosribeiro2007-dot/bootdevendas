const puppeteer = require('puppeteer');
const logger = require('../config/logger');

class ScraperService {
    async searchWithBrowser(keyword) {
        logger.info(`Iniciando busca robusta para: ${keyword}`);
        let browser;
        try {
            browser = await puppeteer.launch({
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                headless: 'new',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process',
                    '--js-flags="--max-old-space-size=200"'
                ]
            });
            const page = await browser.newPage();
            
            // 🛡️ BLOQUEAR IMAGENS E CSS PARA ECONOMIZAR RAM
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
            
            const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(keyword)}_OrderId_items_sold_desc`;
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

            const products = await page.evaluate(() => {
                const results = [];
                const items = document.querySelectorAll('.poly-card, .ui-search-result, .ui-search-layout__item');
                
                items.forEach((item, index) => {
                    if (results.length >= 10) return; 
                    const titleEl = item.querySelector('.poly-component__title, .ui-search-item__title, h2');
                    const priceEl = item.querySelector('.andes-money-amount__fraction');
                    const imgEl = item.querySelector('img');

                    if (titleEl && priceEl) {
                        const link = item.querySelector('a')?.href || '';
                        let price = parseFloat(priceEl.innerText.replace(/\./g, '')) || 0;
                        let imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

                        if (link && price > 0) {
                            results.push({ id: `ML${Date.now()}${index}`, title: titleEl.innerText, price, link, thumbnail: imageUrl });
                        }
                    }
                });
                return results;
            });

            logger.info(`Busca robusta finalizada com ${products.length} produtos.`);
            return products;
        } catch (error) {
            logger.error(`Erro na busca robusta: ${error.message}`);
            return [];
        } finally {
            if (browser) await browser.close();
        }
    }
}

module.exports = new ScraperService();
