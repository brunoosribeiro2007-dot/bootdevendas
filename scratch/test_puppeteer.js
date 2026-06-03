const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' // Helps bypass bot detection
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // Evita que o site detecte que o navegador é automatizado
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });

        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        
        const url = 'https://lista.mercadolivre.com.br/Xiaomi_Discount_10-100_NoIndex_True';
        console.log(`Navigating to ${url}...`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('Initial page loaded. Waiting 15 seconds for challenge solver and redirect...');
        
        // Wait 15 seconds to allow verifyChallenge to complete and redirect
        await new Promise(r => setTimeout(r, 15000));
        
        console.log('Finished waiting. Checking page state...');
        const title = await page.title();
        console.log('Current Page Title:', title);
        
        const currentUrl = page.url();
        console.log('Current URL:', currentUrl);

        const html = await page.content();
        fs.writeFileSync(path.join(__dirname, 'pup_response_redirect.html'), html);
        console.log('Saved page content to pup_response_redirect.html');
        
        // Try parsing product cards
        const productCount = await page.evaluate(() => {
            const cards = document.querySelectorAll('.poly-card, .ui-search-result__content-wrapper, .ui-search-item');
            return cards.length;
        });
        
        console.log('Found product elements in page:', productCount);
        
        // Take a screenshot of the redirected page
        await page.screenshot({ path: path.join(__dirname, 'pup_screenshot_redirect.png') });
        console.log('Screenshot saved to pup_screenshot_redirect.png');
        
    } catch (e) {
        console.error('Error during Puppeteer run:', e);
    } finally {
        await browser.close();
    }
}

run();
