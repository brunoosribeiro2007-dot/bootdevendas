const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');

/**
 * Parser unificado para as páginas do Mercado Livre
 */
const parseProducts = (html, searchTerm, isProxy = false) => {
    const $ = cheerio.load(html);
    const products = [];
    
    const getStableId = (link, title) => {
        const mlbMatch = link.match(/MLB-?(\d+)/i);
        if (mlbMatch) return `MLB${mlbMatch[1]}`;
        const hash = Buffer.from(title || link).toString('base64').substring(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
        return `MLH-${hash}`;
    };

    const unwrapLink = (link) => {
        if (!link) return link;
        if (isProxy && link.includes('translate.google.com')) {
            try {
                const urlObj = new URL(link);
                const u = urlObj.searchParams.get('u');
                return u ? u : link;
            } catch (e) { return link; }
        }
        return link;
    };

    // Seletores de itens
    const containerSelectors = [
        '.poly-card', 
        '.ui-search-result__content-wrapper', 
        '.ui-search-result', 
        '.ui-search-layout__item',
        '.poly-card__content',
        'li.ui-search-layout__item'
    ];
    
    containerSelectors.forEach(selector => {
        if (products.length >= 10) return;
        
        $(selector).each((i, element) => {
            if (products.length >= 10) return false;
            try {
                // 🛑 VERIFICAÇÃO DE DISPONIBILIDADE
                const isUnavailable = $(element).text().toLowerCase().includes('esgotado') || 
                                    $(element).text().toLowerCase().includes('indisponível') ||
                                    $(element).find('.ui-search-item__status-ticket').text().toLowerCase().includes('indisponível');
                
                if (isUnavailable) return;

                const titleElement = $(element).find('.poly-component__title, .ui-search-item__title, .ui-search-result__content-title, .ui-search-item__group__element.ui-search-item__title, h2, h3').first();
                const title = titleElement.text().trim();

                // ⭐ VERIFICAÇÃO DE QUALIDADE (Avaliação e Vendas)
                const ratingText = $(element).find('.poly-reviews__rating, .ui-search-reviews__rating-number').first().text();
                const rating = parseFloat(ratingText.replace(',', '.'));
                
                const reviewsCountText = $(element).find('.poly-reviews__total, .ui-search-reviews__amount').first().text();
                const salesText = $(element).find('.poly-component__sales, .ui-search-item__group__element--shipping').text().toLowerCase();
                
                // Critério: Se tiver avaliação e for menor que 4.0, a gente ignora. 
                // Se não tiver avaliação nenhuma, a gente só aceita se for "Loja Oficial" ou tiver muitas vendas.
                const isOfficialStore = $(element).text().toLowerCase().includes('loja oficial');
                const hasGoodSales = salesText.includes('vendidos') && !salesText.includes('5 vendidos') && !salesText.includes('2 vendidos');

                if (rating && rating < 4.0) {
                    logger.debug(`⏩ Ignorando "${title}" por baixa avaliação: ${rating}`);
                    return;
                }
                
                if (!rating && !isOfficialStore && !hasGoodSales) {
                    logger.debug(`⏩ Ignorando "${title}" por falta de indicadores de confiança.`);
                    return;
                }
                
                // 💰 CAPTURA DE PREÇO MELHORADA (Pega o preço atual/final)
                const priceContainer = $(element).find('.andes-money-amount--current, .ui-search-price__second-line').first();
                const priceFrac = priceContainer.find('.andes-money-amount__fraction').text().replace(/\D/g, '') || 
                                 $(element).find('.andes-money-amount__fraction').first().text().replace(/\D/g, '');
                const priceCents = priceContainer.find('.andes-money-amount__cents').text().replace(/\D/g, '') || '00';
                
                // Tenta pegar o preço antigo para calcular desconto real
                const oldPriceElement = $(element).find('.andes-money-amount--previous, .ui-search-price__part--original').first();
                const oldPriceFrac = oldPriceElement.find('.andes-money-amount__fraction').text().replace(/\D/g, '');
                const oldPrice = oldPriceFrac ? parseFloat(oldPriceFrac) : null;

                if (!title || !priceFrac) return;

                const price = parseFloat(`${priceFrac}.${priceCents}`);
                
                let link = $(element).find('a').attr('href') || titleElement.closest('a').attr('href') || $(element).find('.ui-search-link').attr('href');
                link = unwrapLink(link);
                
                if (link && link.startsWith('//')) link = 'https:' + link;

                // Tentar várias formas de pegar a imagem
                let image = $(element).find('img').attr('data-src') || 
                            $(element).find('img').attr('src') ||
                            $(element).find('img').attr('srcset')?.split(' ')[0] ||
                            $(element).find('.poly-component__picture img').attr('src');

                // Evitar placeholders ou imagens de carregamento
                if (image && (image.includes('data:image') || image.includes('pixel.gif'))) {
                    image = $(element).find('img').attr('data-src') || $(element).find('img').attr('data-srcset')?.split(' ')[0];
                }

                if (title && price && link) {
                    const id = getStableId(link, title);
                    if (!products.find(p => p.id === id)) {
                        products.push({ 
                            id, 
                            title, 
                            price, 
                            oldPrice,
                            link, 
                            imageUrl: image, 
                            description: `Oferta imperdível: ${searchTerm}${isProxy ? ' (via Stealth)' : ''}` 
                        });
                    }
                }
            } catch (err) {
                logger.debug(`Erro no loop de parse: ${err.message}`);
            }
        });
    });

    return products;
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
    // Tenta domínios diferentes caso um falhe no DNS (comum no Render)
    const apiDomains = ['api.mercadolivre.com', 'api.mercadolibre.com'];
    
    for (const domain of apiDomains) {
        try {
            const fakeIP = getRandomBrIP();
            logger.info(`🔌 Tentando API Fallback (${domain}) para: ${searchTerm}...`);
            
            await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

            const apiUrl = `https://${domain}/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=15`;
            
            const { data } = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': 'MercadoLibre/10.354.0 (iPhone; iOS 17.4.1)',
                    'X-Forwarded-For': fakeIP,
                },
                timeout: 8000
            });
            
            if (data.results && data.results.length > 0) {
                const results = data.results.map(p => ({
                    id: p.id,
                    title: p.title,
                    price: p.price,
                    oldPrice: p.original_price, // Agora capturando o preço original da API
                    link: p.permalink,
                    imageUrl: p.thumbnail?.replace('-I.jpg', '-O.jpg'),
                    description: 'Oferta (API Mobile)'
                }));
                logger.info(`✅ API Fallback (${domain}) funcionou para "${searchTerm}"!`);
                return results;
            }
        } catch (apiErr) {
            logger.warn(`⚠️ Falha no domínio ${domain}: ${apiErr.message}`);
            continue; // Tenta o próximo domínio
        }
    }
    
    logger.error(`❌ Falha total em todos os domínios de API para "${searchTerm}".`);
    return [];
};
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

/**
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
        return await searchViaStealthProxy(searchTerm, category);
    }
};

module.exports = {
  searchProducts
};
