const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

/**
 * Busca produtos no Mercado Livre.
 * Tenta Scraper Direto -> Scraper via Proxy (Stealth) -> API Fallback.
 */
const searchProducts = async (searchTerm, category = '') => {
    logger.info(`🔍 Buscando produtos no Mercado Livre para: "${searchTerm}"...`);
    
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1'
    ];

    const referers = [
        'https://www.google.com/',
        'https://www.bing.com/',
        'https://duckduckgo.com/',
        'https://t.co/',
        'https://www.facebook.com/'
    ];

    try {
        let url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        if (category) {
            url = `https://lista.mercadolivre.com.br/${category}/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        }
        
        const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        const selectedRef = referers[Math.floor(Math.random() * referers.length)];

        logger.debug(`Requisição direta para: ${url}`);
        
        const { data: html, status } = await axios.get(url, {
            headers: {
                'User-Agent': selectedUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
                'Referer': selectedRef,
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"'
            },
            timeout: 10000,
            validateStatus: () => true
        });

        if (status === 403 || html.includes('id="captcha"') || html.includes('g-recaptcha') || html.includes('Forbidden')) {
            logger.warn(`⚠️ Bloqueio direto detectado (Status ${status}). Ativando Modo Stealth...`);
            return await searchViaStealthProxy(searchTerm, category);
        }

        const products = parseProducts(html, searchTerm);
        
        if (products.length === 0) {
            logger.info(`ℹ️ 0 produtos no scraper direto para "${searchTerm}". Tentando Modo Stealth...`);
            return await searchViaStealthProxy(searchTerm, category);
        }

        logger.info(`✅ Sucesso no Scraper Direto para "${searchTerm}" (${products.length} itens).`);
        return products;
        
    } catch (error) {
        logger.warn(`⚠️ Erro no Scraper Direto (${error.message}). Tentando Modo Stealth...`);
        return await searchViaStealthProxy(searchTerm, ca/**
 * Bypass de IP via Google Translate (Stealth Proxy 1)
 */
const searchViaStealthProxy = async (searchTerm, category = '') => {
    try {
        logger.info(`🕵️ Ativando Scraper Stealth (Proxy 1: Google) para: ${searchTerm}...`);
        let targetUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        if (category) {
             targetUrl = `https://lista.mercadolivre.com.br/${category}/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        }
        
        // Adiciona bypass de cache
        targetUrl += `${targetUrl.includes('?') ? '&' : '?'}b=${Math.random().toString(36).substring(7)}`;

        const proxyUrl = `https://translate.google.com/translate?sl=en&tl=pt&u=${encodeURIComponent(targetUrl)}`;
        
        const { data: html } = await axios.get(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
            },
            timeout: 15000
        });

        const products = parseProducts(html, searchTerm, true);
        
        if (products.length === 0) {
            logger.warn(`ℹ️ Proxy 1 (Google) falhou para "${searchTerm}". Tentando Proxy 2 (Bing)...`);
            return await searchViaBingProxy(searchTerm, category);
        }

        logger.info(`🚀 Proxy 1 (Google) funcionou! (${products.length} itens) para "${searchTerm}".`);
        return products;
    } catch (err) {
        logger.warn(`⚠️ Erro no Proxy 1 (Google): ${err.message}. Tentando Proxy 2 (Bing)...`);
        return await searchViaBingProxy(searchTerm, category);
    }
};

/**
 * Bypass via Bing Translator (Stealth Proxy 2)
 */
const searchViaBingProxy = async (searchTerm, category = '') => {
    try {
        logger.info(`🕵️ Ativando Scraper Stealth (Proxy 2: Bing) para: ${searchTerm}...`);
        let targetUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        if (category) {
            targetUrl = `https://lista.mercadolivre.com.br/${category}/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}`;
        }

        const proxyUrl = `https://www.bing.com/translator/?to=pt&url=${encodeURIComponent(targetUrl)}`;
        
        const { data: html } = await axios.get(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            },
            timeout: 15000
        });

        const products = parseProducts(html, searchTerm, true);
        
        if (products.length === 0) {
            logger.warn(`ℹ️ Proxy 2 (Bing) falhou para "${searchTerm}". Tentando API Fallback...`);
            return await fetchFromBackupAPI(searchTerm);
        }

        logger.info(`🚀 Proxy 2 (Bing) funcionou! (${products.length} itens) para "${searchTerm}".`);
        return products;
    } catch (err) {
        logger.warn(`⚠️ Erro no Proxy 2 (Bing): ${err.message}. Tentando API Fallback...`);
        return await fetchFromBackupAPI(searchTerm);
    }
};

const getRandomBrIP = () => {
    const bases = ['177', '179', '186', '187', '189', '191', '200', '201'];
    const base = bases[Math.floor(Math.random() * bases.length)];
    return `${base}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
};

/**
 * API Fallback camuflada com Headers de App Mobile e Spoofing de IP
 */
const fetchFromBackupAPI = async (searchTerm) => {
    try {
        const fakeIP = getRandomBrIP();
        logger.info(`🔌 Tentando API Fallback camuflada (IP Simulado: ${fakeIP}) para: ${searchTerm}...`);
        
        // Jitter maior para evitar detecção
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

        const apiUrl = `https://api.mercadolivre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=15&offset=${Math.floor(Math.random() * 5)}`;
        
        const { data } = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'MercadoLibre/10.354.0 (iPhone; iOS 17.4.1; Scale/3.00)',
                'Accept': 'application/json',
                'X-Platform': 'iOS',
                'X-App-Version': '10.354.0',
                'X-Forwarded-For': fakeIP,
                'X-Real-IP': fakeIP,
                'Accept-Language': 'pt-BR,pt;q=0.9',
            },
            timeout: 10000,
            validateStatus: (status) => status < 500
        });
        
        if (data.results && data.results.length > 0) {
            const results = data.results.map(p => ({
                id: p.id,
                title: p.title,
                price: p.price,
                link: p.permalink,
                imageUrl: p.thumbnail?.replace('-I.jpg', '-O.jpg'),
                description: 'Oferta (API Mobile)'
            }));
            logger.info(`✅ API Fallback funcionou para "${searchTerm}"! (${results.length} itens).`);
            return results;
        }

        throw new Error('Retorno vazio na API');

    } catch (apiErr) {
        const isBlock = apiErr.response?.status === 403 || apiErr.message.includes('403');
        const statusMsg = isBlock ? 'Bloqueio Persistente (ML detectou o Render)' : apiErr.message;
        logger.error(`❌ Falha total (${statusMsg}) para "${searchTerm}".`);
        return [];
    }
};

: ${apiErr.message}`);
        return [];
    }
};

module.exports = {
  searchProducts
};

