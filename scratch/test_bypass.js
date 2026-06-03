const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256(message) {
    return crypto.createHash('sha256').update(message).digest('hex');
}

function solveChallenge(n, i) {
    console.log(`Solving challenge for n="${n}", i=${i}`);
    if (i === '0' || i === 0 || !i) return 0;
    const prefix = '0'.repeat(parseInt(i, 10));
    let r = 0;
    for (let rVal = 0; rVal < Number.MAX_SAFE_INTEGER; rVal++) {
        const hash = sha256(n + rVal);
        if (hash.startsWith(prefix)) {
            console.log(`Found solution r=${rVal} after ${rVal} attempts, hash=${hash}`);
            return rVal;
        }
    }
    return 0;
}

function parseSetCookies(setCookieHeaders) {
    if (!setCookieHeaders) return {};
    const cookies = {};
    for (const header of setCookieHeaders) {
        const parts = header.split(';')[0].split('=');
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        cookies[name] = value;
    }
    return cookies;
}

function serializeCookies(cookiesObj) {
    return Object.entries(cookiesObj)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

async function testBypass() {
    const searchTerm = 'Xiaomi';
    const cacheBuster = Math.floor(Math.random() * 100);
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
    
    // Exact same headers that successfully get the JS challenge page
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    try {
        console.log('Sending first request...');
        const response1 = await axios.get(url, {
            headers,
            timeout: 10000,
            validateStatus: () => true
        });

        console.log('Response 1 Status:', response1.status);
        console.log('Response 1 Body Length:', response1.data ? response1.data.length : 0);
        
        const cookies = parseSetCookies(response1.headers['set-cookie']);
        console.log('Parsed Cookies:', cookies);
        
        if (!cookies['_bmstate']) {
            console.log('No _bmstate cookie found!');
            if (response1.data) {
                console.log('Body Preview:', response1.data.substring(0, 1000));
            }
            return;
        }

        const decodedBmstate = decodeURIComponent(cookies['_bmstate']);
        const bmstateParts = decodedBmstate.split(';');
        const n = bmstateParts[0];
        const i = bmstateParts[1];

        const r = solveChallenge(n, i);

        cookies['_bmc'] = encodeURIComponent(`${n};${r}`);
        cookies['_bm_skipml'] = 'true';

        const cookieString = serializeCookies(cookies);
        console.log('Sending second request with solved challenge cookies...');

        const response2 = await axios.get(url, {
            headers: {
                ...headers,
                'Cookie': cookieString
            },
            timeout: 10000,
            validateStatus: () => true
        });

        console.log('Response 2 Status:', response2.status);
        console.log('Response 2 Body Length:', response2.data ? response2.data.length : 0);
        
        if (response2.data) {
            const hasChallenge = response2.data.includes('verifyChallenge');
            console.log('Response 2 has challenge:', hasChallenge);
            
            const isSuspicious = response2.data.includes('suspicious-traffic-frontend');
            console.log('Response 2 has suspicious-traffic-frontend:', isSuspicious);
            
            fs.writeFileSync(path.join(__dirname, 'response2_simple.html'), response2.data);
            console.log('Saved response 2 to response2_simple.html');
            
            if (!hasChallenge && !isSuspicious) {
                console.log('Bypass successful! Page title:', response2.data.match(/<title>([^<]+)<\/title>/)?.[1]);
                
                const cheerio = require('cheerio');
                const $ = cheerio.load(response2.data);
                const productCards = $('.poly-card, .ui-search-result__content-wrapper, .ui-search-item');
                console.log('Found product elements in page:', productCards.length);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testBypass();
