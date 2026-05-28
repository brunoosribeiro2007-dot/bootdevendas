const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
require('dotenv').config();

const productUrl = process.argv[2];
const tag = process.argv[3] || process.env.ML_AFFILIATE_TAG;
const cookiesPath = process.env.ML_COOKIES_PATH || path.resolve(process.cwd(), '.ml_cookies.json');

if (!productUrl) {
  console.error('Usage: node generate_meli_shortlink.js <productUrl> [tag]');
  process.exit(2);
}

const saveCookies = async (page) => {
  const cookies = await page.cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log('COOKIES_SAVED');
};

const loadCookiesIfExists = async (page) => {
  if (fs.existsSync(cookiesPath)) {
    try {
      const raw = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(raw);
      await page.setCookie(...cookies);
      console.log('COOKIES_LOADED');
      return true;
    } catch (e) {
      console.warn('Failed to load cookies:', e.message);
    }
  }
  return false;
};

const tryClickSelectors = async (page, selectors) => {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      await page.click(sel);
      return true;
    } catch (e) {
      // ignore
    }
  }
  return false;
};

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // Try to load cookies first
  const hadCookies = await loadCookiesIfExists(page);

  // Navigate to product page
  await page.goto(productUrl, { waitUntil: 'networkidle2' });

  if (!hadCookies) {
    console.log('Please log in to Mercado Livre in the opened browser window, then press ENTER here to continue (or Ctrl+C to abort).');
    await new Promise((res) => {
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.pause();
        res();
      });
    });
    await saveCookies(page);
  }

  // Re-open product after login
  await page.goto(productUrl, { waitUntil: 'networkidle2' });

  // Try to open share modal (common selectors)
  const shareSelectors = ['button.share', 'button[data-testid="share-button"]', '.ui-pdp__share', 'a.share', '.share'];
  const openedShare = await tryClickSelectors(page, shareSelectors);

  if (!openedShare) {
    console.log('WARN: share modal not opened automatically; please open the share modal manually in the browser now and press ENTER here.');
    await new Promise((res) => {
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.pause();
        res();
      });
    });
  }

  // Try to click "Gerar link" / affiliate button
  const genSelectors = ['button[aria-label*="Gerar link"]', 'button[data-testid="generate-affiliate-link"]', 'button.generate-link', '.affiliate-generate', 'button:contains("Gerar link")'];
  // attempt click, but some selectors may not work; try to find input with meli.la link
  try {
    // Wait a bit for modal to render
    await page.waitForTimeout(1000);
    // Attempt to find an input containing meli.la
    const val = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const el of inputs) {
        const v = el.value || el.getAttribute('value') || '';
        if (v && v.includes('meli.la')) return v;
      }
      const anchors = Array.from(document.querySelectorAll('a'));
      for (const a of anchors) {
        const href = a.href || '';
        if (href && href.includes('meli.la')) return href;
      }
      return null;
    });

    if (val) {
      console.log('SHORTLINK:', val);
      await browser.close();
      process.exit(0);
    }
  } catch (e) {
    // ignore
  }

  // If not found, try clicking generate button selectors
  const clicked = await tryClickSelectors(page, genSelectors);
  if (clicked) {
    // wait and try extract
    await page.waitForTimeout(1200);
    const val2 = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const el of inputs) {
        const v = el.value || el.getAttribute('value') || '';
        if (v && v.includes('meli.la')) return v;
      }
      const anchors = Array.from(document.querySelectorAll('a'));
      for (const a of anchors) {
        const href = a.href || '';
        if (href && href.includes('meli.la')) return href;
      }
      return null;
    });
    if (val2) {
      console.log('SHORTLINK:', val2);
      await browser.close();
      process.exit(0);
    }
  }

  // Last resort: copy any meli.la present in DOM text
  const foundText = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const m = t.match(/https?:\/\/meli\.la\/[A-Za-z0-9_-]+/);
    return m ? m[0] : null;
  });

  if (foundText) {
    console.log('SHORTLINK:', foundText);
    await browser.close();
    process.exit(0);
  }

  console.error('NO_SHORTLINK_FOUND: Please open the share modal, generate the link manually once, then re-run.');
  await browser.close();
  process.exit(3);
})();
