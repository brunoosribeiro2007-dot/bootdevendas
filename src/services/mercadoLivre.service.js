const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const env = require('../config/env');

// 🛑 FILTRO DE NICHO (CASA): Ignora ferramentas pesadas, eletrônicos gamer, automotivos e beleza/cosméticos
const PRODUCT_BLACKLIST = [
    // 🔧 Ferramentas e automotivo
    'martelete', 'parafusadeira', 'furadeira', 'ferramenta', 'pneu', 'pc gamer',
    'oficina', 'mecanico', 'gamer', 'brinquedo', 'peca de carro', 'moto',
    'chave de fenda', 'serra', 'trena', 'multimetro', 'politriz', 'esmerilhadeira',
    'carro', 'automotivo', 'automotiva', 'veículo', 'veicular', 'capacete', 'retrovisor',
    'farol', 'calota', 'volante', 'protetor solar para carro', 'limpador de parabrisa',
    'óleo de motor', 'bateria de carro', 'som automotivo', 'central multimídia',
    'tapete de carro', 'capa de banco', 'suporte celular carro', 'transmissor fm',
    'carregador veicular', 'p/ carro', 'para carro',
    // 💊 Suplementos e saúde
    'creatina', 'whey', 'suplemento', 'proteína', 'bcaa', 'termogênico', 'emagrecer',
    'vitamina', 'ômega 3', 'colágeno', 'pré-treino', 'albumina', 'glutamina',
    // 👗 Moda e vestuário
    'tênis', 'tenis', 'sapato', 'calçado', 'roupa', 'camisa', 'camiseta', 'calça', 'bermuda', 'jaqueta', 'casaco',
    // 🚿 Hidráulica
    'aquecedor', 'chuveiro', 'ducha', 'torneira', 'vaso sanitario', 'assento sanitario', 'pressurizador',
    // 💄 Beleza, cosméticos e cuidados pessoais — FORA DO NICHO CASA
    'shampoo', 'condicionador', 'mascara capilar', 'mascara facial', 'creme facial', 'creme para rosto',
    'hidratante facial', 'hidratante corporal', 'protetor solar', 'bronzeador', 'autobronzeador',
    'esfoliante', 'tônico facial', 'sérum', 'serum facial', 'vitamina c facial',
    'maquiagem', 'base maquiagem', 'batom', 'blush', 'sombra', 'rímel', 'rimel', 'delineador',
    'contorno', 'primer facial', 'bb cream', 'cc cream', 'pó facial', 'corretivo',
    'perfume', 'colônia', 'desodorante', 'antitranspirante',
    'shave', 'barbear', 'lâmina de barbear', 'gel de barbear', 'after shave',
    'baume', 'balsamo corporal', 'óleo corporal', 'loção corporal', 'manteiga corporal',
    'creme anticaspa', 'antiqueda', 'crescimento cabelo', 'minoxidil',
    'escova progressiva', 'alisamento', 'tintura cabelo', 'coloração cabelo', 'botox capilar',
    'esmalte', 'acetona', 'removedor de esmalte', 'base para unhas', 'top coat',
    'la roche', 'la roche posay', 'cicaplast', 'cerave', 'neutrogena', 'vichy', 'avene',
    'dove', 'nívea', 'nivea', 'garnier', 'loreal', 'l\'oreal', 'maybelline', 'revlon',
    'kerastase', 'keratin', 'pantene', 'head shoulders', 'tresemme', 'seda',
    'bioderma', 'roc', 'eucerin', 'isdin', 'skincare', 'skin care', 'dermocosmetico'
];

/**
 * Checa se o título do produto corresponde a algum termo da blacklist,
 * permitindo exceções específicas do nicho casa (como guarda-roupa, cesto de roupas, etc.)
 */
const isProductBlacklisted = (title) => {
    if (!title) return false;
    const titleLower = title.toLowerCase();
    return PRODUCT_BLACKLIST.some(word => {
        // ─── Exceções para itens do nicho Casa ───────────────────────────────
        if (word === 'roupa' && (titleLower.includes('guarda-roupa') || titleLower.includes('cesto') || titleLower.includes('varal') || titleLower.includes('cabide') || titleLower.includes('lavar'))) {
            return false;
        }
        if (word === 'ferramenta' && titleLower.includes('caixa de ferramentas')) {
            return false;
        }
        // 'esmalte' pode aparecer em tintas/revestimentos de parede — permitir
        if (word === 'esmalte' && (titleLower.includes('tinta') || titleLower.includes('parede') || titleLower.includes('revestimento') || titleLower.includes('piso'))) {
            return false;
        }
        // 'condicionador' em contexto de ar-condicionado — permitir
        if (word === 'condicionador' && (titleLower.includes('ar') || titleLower.includes('ambiente') || titleLower.includes('split'))) {
            return false;
        }
        // 'base' em contexto de móveis/prateleiras — permitir
        if (word === 'base maquiagem' && (titleLower.includes('suporte') || titleLower.includes('prateleira') || titleLower.includes('rack') || titleLower.includes('concreto'))) {
            return false;
        }
        // 'shampoo' para carpete/tapete/sofá — permitir
        if (word === 'shampoo' && (titleLower.includes('carpete') || titleLower.includes('tapete') || titleLower.includes('sofa') || titleLower.includes('sofá') || titleLower.includes('estofado'))) {
            return false;
        }
        // 'seda' pode ser tecido para casa (lençol, fronha) — permitir
        if (word === 'seda' && (titleLower.includes('len') || titleLower.includes('fronha') || titleLower.includes('cama') || titleLower.includes('pijama') || titleLower.includes('lençol'))) {
            return false;
        }
        // ─────────────────────────────────────────────────────────────────────
        return titleLower.includes(word);
    });
};

/**
 * Parser unificado para as páginas do Mercado Livre
 */
const parseProducts = (html, searchTerm, isProxy = false) => {
    if (!html || typeof html !== 'string') return [];
    
    // 🛡️ PROTEÇÃO DE MEMÓRIA CRÍTICA: Ignora HTMLs > 13MB
    if (html.length > 13 * 1024 * 1024) {
        logger.warn(`⚠️ HTML extremamente grande para a RAM (${(html.length / 1024 / 1024).toFixed(2)}MB). Ignorando.`);
        return [];
    }

    // 🚀 OTIMIZAÇÃO: Remove <script> e <style> antes de carregar no Cheerio (economiza 50-70% de RAM)
    const cleanedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    let $ = cheerio.load(cleanedHtml);
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

    // Seletores de itens (Expandido para novos layouts)
    const containerSelectors = [
        '.poly-card', 
        '.ui-search-result__content-wrapper', 
        '.ui-search-item',
        '.ui-search-result', 
        '.ui-search-layout__item',
        '.poly-card__content',
        'li.ui-search-layout__item'
    ];
    
    let containerFound = false;
    containerSelectors.forEach(selector => {
        if (products.length >= 30) return;
        const els = $(selector);
        if (els.length > 0) {
            containerFound = true;
            logger.debug(`Found ${els.length} items with selector: ${selector}`);
        }
        
        els.each((i, element) => {
            if (products.length >= 30) return false;
            try {
                // 🛑 VERIFICAÇÃO DE DISPONIBILIDADE
                const elementText = $(element).text().toLowerCase();
                const isUnavailable = elementText.includes('esgotado') || 
                                    elementText.includes('indisponível') ||
                                    $(element).find('.ui-search-item__status-ticket').text().toLowerCase().includes('indisponível');
                if (isUnavailable) return; // ← CORRIGIDO: Estava sendo ignorado!

                // 🔗 CAPTURA DE TÍTULO
                const titleElement = $(element).find('.poly-component__title, .ui-search-item__title, .ui-search-result__content-title, .ui-search-item__group__element.ui-search-item__title, h2, h3').first();
                const title = titleElement.text().trim();
                if (!title) return;

                // 🛑 FILTRO DE NICHO (CASA)
                if (isProductBlacklisted(title)) {
                    logger.debug(`⏩ Ignorando "${title}" por não ser do nicho Casa.`);
                    return;
                }

                // 🔗 CAPTURA DE LINK
                const linkElement = $(element).find('a.poly-component__title, a.ui-search-link, a.poly-card__title').first();
                let link = linkElement.attr('href') || $(element).find('a').attr('href') || titleElement.closest('a').attr('href');
                if (!link) return;
                link = unwrapLink(link);
                if (link && link.startsWith('//')) link = 'https:' + link;

                // 🚨 GARANTIA DE AFILIADO: Ignoramos links de anúncios (click1/mclics)
                if (link.includes('click1.mercadolivre') || link.includes('mclics')) {
                    logger.debug(`⏩ Ignorando anúncio patrocinado: ${title}`);
                    return;
                }

                // 🏷️ VERIFICAÇÃO DE PROMOÇÃO (Preferência, não obrigatório)
                const hasDiscount = $(element).find('.andes-money-amount__discount, .ui-search-price__discount').length > 0;

                // ⭐ VERIFICAÇÃO DE QUALIDADE (Avaliação e Vendas)
                const ratingElement = $(element).find('.poly-reviews__rating, .ui-search-reviews__rating-number, .ui-search-item__group__element--reviews').first();
                const ratingText = ratingElement.text();
                const rating = parseFloat(ratingText.replace(',', '.'));
                
                // 💬 CAPTURA DA QUANTIDADE DE AVALIAÇÕES
                let reviewsCount = 0;
                const reviewsElement = $(element).find('.poly-reviews__total, .ui-search-reviews__amount').first();
                if (reviewsElement.length > 0) {
                    reviewsCount = parseInt(reviewsElement.text().replace(/\D/g, ''), 10) || 0;
                } else if (ratingElement.length > 0) {
                    const parentheticalMatch = ratingElement.text().match(/\(([^)]+)\)/);
                    if (parentheticalMatch) {
                        reviewsCount = parseInt(parentheticalMatch[1].replace(/\D/g, ''), 10) || 0;
                    }
                }

                const salesElement = $(element).find('.poly-component__sales, .ui-search-item__group__element--shipping, .ui-search-item__quantity-sold').first();
                const salesText = salesElement.text().toLowerCase();
                
                // Critério de Sofisticação: Priorizamos Loja Oficial e Full
                const isOfficialStore = $(element).text().toLowerCase().includes('loja oficial') || $(element).find('.ui-search-official-store-label').length > 0;
                const isFull = salesText.includes('full') || $(element).find('.ui-search-item__shipping--full').length > 0;

                // 🛑 FILTRO DE QUALIDADE RIGOROSO (Mapeamento de 4.2 estrelas e 30 avaliações)
                if (!rating || rating < 4.2) {
                    logger.debug(`⏩ Ignorando "${title}" por avaliação insuficiente ou inexistente: ${rating || 'N/A'}`);
                    return;
                }

                if (reviewsCount < 30) {
                    logger.debug(`⏩ Ignorando "${title}" por quantidade de avaliações insuficiente: ${reviewsCount}`);
                    return;
                }
                
                // 💰 CAPTURA DE PREÇO
                let currentMoneyEl = $(element).find('.poly-price__current .andes-money-amount, .ui-search-price__second-line .andes-money-amount, .andes-money-amount--current').filter(function() {
                    return $(this).closest('.poly-price__installments, .ui-search-item__group__element--installments').length === 0;
                }).first();
                
                let priceFrac = currentMoneyEl.find('.andes-money-amount__fraction').text().replace(/\D/g, '');
                let priceCents = currentMoneyEl.find('.andes-money-amount__cents').text().replace(/\D/g, '') || '00';
                
                if (!priceFrac) {
                    const fallbackEl = $(element).find('.andes-money-amount').filter(function() {
                        return !$(this).hasClass('andes-money-amount--previous') &&
                               $(this).closest('.poly-price__installments, .ui-search-item__group__element--installments').length === 0;
                    }).first();
                    priceFrac = fallbackEl.find('.andes-money-amount__fraction').text().replace(/\D/g, '');
                    priceCents = fallbackEl.find('.andes-money-amount__cents').text().replace(/\D/g, '') || '00';
                }

                const previousMoneyEl = $(element).find('.andes-money-amount--previous').first();
                const oldPriceFrac = previousMoneyEl.find('.andes-money-amount__fraction').text().replace(/\D/g, '');
                const oldPrice = oldPriceFrac ? parseFloat(oldPriceFrac) : null;

                if (!priceFrac) return;
                const price = parseFloat(`${priceFrac}.${priceCents}`);
                
                // 🏷️ CÁLCULO DE DESCONTO REAL
                let discountPercent = 0;
                if (oldPrice && price < oldPrice) {
                    discountPercent = Math.round(((oldPrice - price) / oldPrice) * 100);
                }

                // 🛑 FILTRO DE "OFERTA DE VERDADE"
                // Só aceita se tiver pelo menos 15% de desconto OU for Loja Oficial + Full
                if (discountPercent < 15 && !isOfficialStore) {
                    logger.debug(`⏩ Ignorando "${title}" por desconto baixo (${discountPercent}%) e não ser Loja Oficial.`);
                    return;
                }
                
                // Tentar várias formas de pegar a imagem
                let image = $(element).find('img').attr('data-src') || 
                            $(element).find('img').attr('src') ||
                            $(element).find('img').attr('srcset')?.split(' ')[0] ||
                            $(element).find('.poly-component__picture img').attr('src');

                if (image && (image.includes('data:image') || image.includes('pixel.gif'))) {
                    image = $(element).find('img').attr('data-src') || $(element).find('img').attr('data-srcset')?.split(' ')[0];
                }

                if (image && image.includes('-I.jpg')) {
                    image = image.replace('-I.jpg', '-W.jpg');
                }

                // 🏷️ CAPTURA DE CUPOM (SE HOUVER)
                const couponEl = $(element).find('.poly-coupons__pill, [class*="coupons__pill"], [class*="coupon-pill"]').first();
                let couponText = '';
                if (couponEl.length > 0) {
                    couponText = couponEl.text().replace(/\s+/g, ' ').trim();
                }

                if (title && price && link) {
                    const id = getStableId(link, title);
                    if (!products.find(p => p.id === id)) {
                        // Atribuindo um Score de Qualidade para ordenação posterior (relevância + nota + reviews)
                        const qualityScore = ((rating || 4.5) * 25) + (reviewsCount / 50) + (isOfficialStore ? 50 : 0) + (isFull ? 30 : 0) + (discountPercent);
                        
                        products.push({ 
                            id, 
                            title, 
                            price, 
                            oldPrice,
                            discountPercent,
                            isOfficialStore,
                            isFull,
                            qualityScore,
                            link, 
                            imageUrl: image, 
                            description: `Oferta: ${searchTerm}`,
                            coupon: couponText,
                            rating,
                            reviewsCount
                        });
                    }
                }
            } catch (err) {
                logger.debug(`Erro no loop de parse: ${err.message}`);
            }
        });
    });

    if (products.length === 0 && !containerFound) {
        if (html.includes('id="captcha"') || html.includes('g-recaptcha') || html.includes('challenge')) {
            logger.warn(`🛑 Bloqueio detectado no conteúdo (Captcha/Challenge found).`);
        } else {
            logger.debug(`Nenhum seletor de container funcionou nesta página.`);
        }
    }

    // ⭐ LIMPEZA DE MEMÓRIA PÓS-PARSE
    $ = null; 
    if (global.gc) {
        try { global.gc(); } catch (e) {}
    }

    // ⭐ ORDENAÇÃO POR QUALIDADE (SOFISTICAÇÃO)
    // Ordenamos pelo qualityScore (Loja Oficial, Full, Desconto) mas mantemos um pouco de aleatoriedade
    return products
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, 12) // Pega os 12 melhores
        .sort(() => Math.random() - 0.5) // Embaralha levemente esses 12
        .slice(0, 10); // Retorna os 10 finais
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
    // Removido api.mercadolivre.com que estava dando ENOTFOUND
    const apiDomains = ['api.mercadolibre.com'];
    
    for (const domain of apiDomains) {
        try {
            const fakeIP = getRandomBrIP();
            logger.info(`🔌 Tentando API Fallback (${domain}) para: ${searchTerm}...`);
            
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));

            // 🏷️ Adicionando filtros de "melhores resultados" (limitado a produtos novos e com boa reputação)
            const apiUrl = `https://${domain}/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=50&sort=relevance&condition=new`;
            
            const headers = {
                'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
                'X-Forwarded-For': fakeIP,
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
                'Accept': 'application/json'
            };

            if (env.mlCookieString) {
                headers['Cookie'] = env.mlCookieString;
            }
            
            const { data } = await axios.get(apiUrl, {
                headers,
                timeout: 8000
            });
            
                if (data.results && data.results.length > 0) {
                    // Filtrar apenas produtos com rating decente se disponível na API
                    const results = data.results
                        .filter(p => !p.title.toLowerCase().includes('usado')) // Garante novos
                        .filter(p => !isProductBlacklisted(p.title)) // Filtro de nicho
                        .filter(p => {
                            const apiRating = p.reviews?.rating_average || p.rating_average || null;
                            const apiReviewsCount = p.reviews?.total || p.reviews?.total_relations || 0;
                            // Exige mais de 4.2 estrelas e pelo menos 30 avaliações
                            return apiRating && apiRating >= 4.2 && apiReviewsCount >= 30;
                        })
                        .map(p => {
                            const apiRating = p.reviews?.rating_average || p.rating_average || null;
                            const apiReviewsCount = p.reviews?.total || p.reviews?.total_relations || 0;
                            const discount = p.original_price && p.price < p.original_price ? Math.round(((p.original_price - p.price) / p.original_price) * 100) : 0;
                            
                            const isOfficial = !!(p.official_store_id || p.official_store_name);
                            const isFull = !!(p.shipping?.store_pick_up || p.shipping?.logistic_type === 'fulfillment');
                            
                            // Calcula score consistente para a API
                            const score = ((apiRating || 4.5) * 25) + (apiReviewsCount / 50) + (isOfficial ? 50 : 0) + (isFull ? 30 : 0) + discount;
                            
                            return {
                                id: p.id,
                                title: p.title,
                                price: p.price,
                                oldPrice: p.original_price || null,
                                discountPercent: discount || null,
                                link: p.permalink,
                                imageUrl: p.thumbnail?.replace('-I.jpg', '-W.jpg') || p.thumbnail?.replace('-I.jpg', '-O.jpg'), // -W é maior
                                description: `Oferta Especial: ${searchTerm}`,
                                rating: apiRating || 4.2,
                                reviewsCount: apiReviewsCount || 30,
                                qualityScore: score
                            };
                        });
                
                logger.info(`✅ API Fallback (${domain}) funcionou para "${searchTerm}"! (${results.length} itens)`);
                return results;
            }
        } catch (apiErr) {
            logger.warn(`⚠️ Falha no domínio ${domain}: ${apiErr.message}`);
            continue; 
        }
    }
    
    logger.error(`❌ Falha total em todos os domínios de API para "${searchTerm}".`);
    return [];
};

/**
 * Função Genérica de Proxy Stealth para reduzir repetição de código
 */
const fetchViaProxy = async (proxyName, proxyUrl, searchTerm, category, nextProxyFn, options = {}) => {
    try {
        logger.info(`🕵️ Ativando ${proxyName} para: ${searchTerm}...`);
        const response = await axios.get(proxyUrl, {
            headers: options.headers || {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9',
            },
            timeout: 15000
        });

        const products = parseProducts(response.data, searchTerm, true);
        
        // ⭐ LIBERAÇÃO IMEDIATA DE MEMÓRIA
        response.data = null; 

        if (products.length > 0) {
            logger.info(`🚀 ${proxyName} funcionou! (${products.length} itens)`);
            return products;
        }
        
        if (nextProxyFn) return await nextProxyFn(searchTerm, category);
    } catch (err) {
        logger.warn(`⚠️ Erro no ${proxyName}: ${err.message}`);
        if (nextProxyFn) return await nextProxyFn(searchTerm, category);
    }
    return [];
};

const searchViaAllOrigins = async (searchTerm, category = '') => {
    const cacheBuster = Math.floor(Math.random() * 100);
    const targetUrl = `https://lista.mercadolivre.com.br/${category ? category + '/' : ''}${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    return await fetchViaProxy('Proxy 4 (AllOrigins)', proxyUrl, searchTerm, category, fetchFromBackupAPI);
};

const searchViaRedirectProxy = async (searchTerm, category = '') => {
    const cacheBuster = Math.floor(Math.random() * 100);
    const targetUrl = `https://lista.mercadolivre.com.br/${category ? category + '/' : ''}${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
    return await fetchViaProxy('Proxy 3 (Redirect)', targetUrl, searchTerm, category, searchViaAllOrigins, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.google.com.br/'
        }
    });
};

const searchViaBingProxy = async (searchTerm, category = '') => {
    const cacheBuster = Math.floor(Math.random() * 100);
    const targetUrl = `https://lista.mercadolivre.com.br/${category ? category + '/' : ''}${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
    const proxyUrl = `https://www.bing.com/translator/?to=pt&url=${encodeURIComponent(targetUrl)}`;
    return await fetchViaProxy('Proxy 2 (Bing)', proxyUrl, searchTerm, category, searchViaRedirectProxy);
};

const searchViaStealthProxy = async (searchTerm, category = '') => {
    const cacheBuster = Math.floor(Math.random() * 100);
    let targetUrl = `https://lista.mercadolivre.com.br/${category ? category + '/' : ''}${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
    const proxyUrl = `https://translate.google.com/translate?sl=en&tl=pt&u=${encodeURIComponent(targetUrl)}`;
    return await fetchViaProxy('Proxy 1 (Google)', proxyUrl, searchTerm, category, searchViaBingProxy);
};

/**
 * Busca ofertas do dia diretamente da página de promoções
 */
const searchDailyDeals = async () => {
    logger.info(`🔥 Buscando ofertas do dia diretamente...`);
    try {
        const url = 'https://www.mercadolivre.com.br/ofertas#nav-header';
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9',
            },
            timeout: 10000
        });

        const products = parseProducts(html, 'Ofertas do Dia');
        if (products.length > 0) {
            logger.info(`✅ Encontradas ${products.length} ofertas do dia!`);
            return products;
        }
    } catch (err) {
        logger.warn(`⚠️ Erro ao buscar ofertas do dia: ${err.message}`);
    }
    return [];
};

/**
 * Identifica a categoria do Mercado Livre ideal com base na palavra-chave
 */
const getCategoryForKeyword = (keyword) => {
    const kw = keyword.toLowerCase();
    
    // Palavras-chave associadas a Eletrodomésticos
    const applianceKeywords = [
        'air fryer', 'fryer', 'liquidificador', 'cafeteira', 'aspirador', 
        'ventilador', 'micro-ondas', 'microondas', 'batedeira', 'geladeira', 
        'refrigerador', 'fogão', 'fogao', 'cooktop', 'forno elétrico', 'forno eletrico',
        'forno', 'sanduicheira', 'chaleira elétrica', 'chaleira eletrica', 'chaleira',
        'purificador de água', 'purificador de agua', 'purificador', 'ar-condicionado',
        'ar condicionado', 'climatizador', 'máquina de lavar', 'lavadora', 'tanquinho',
        'ferro de passar', 'ferro', 'soundbar', 'smart tv', 'tv'
    ];
    
    if (applianceKeywords.some(ak => kw.includes(ak))) {
        return 'MLB5726'; // Eletrodomésticos
    }
    
    return 'MLB1574'; // Casa, Móveis e Decoração (Default do nicho)
};

/**
 * Fallback de busca usando a página oficial de Ofertas do Dia filtrada por categoria
 */
const searchCategoryDealsFallback = async (searchTerm) => {
    const categoryId = getCategoryForKeyword(searchTerm);
    logger.info(`⚠️ Ativando Fallback de Ofertas por Categoria (${categoryId}) para: "${searchTerm}"...`);
    
    try {
        const url = `https://www.mercadolivre.com.br/ofertas?category=${categoryId}`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        const response = await axios.get(url, {
            headers,
            timeout: 10000,
            validateStatus: () => true
        });

        if (response.status !== 200 || !response.data) {
            logger.warn(`⚠️ Fallback: Erro ao obter página de ofertas (Status ${response.status})`);
            return [];
        }

        const allDeals = parseProducts(response.data, searchTerm);
        logger.info(`📦 Fallback: Encontradas ${allDeals.length} ofertas gerais na categoria ${categoryId}`);

        if (allDeals.length === 0) return [];

        // Filtragem em memória pela palavra-chave (ignora palavras muito curtas)
        const searchWords = searchTerm.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);

        const matchedProducts = allDeals.filter(p => {
            const titleLower = p.title.toLowerCase();
            return searchWords.some(word => titleLower.includes(word));
        });

        if (matchedProducts.length > 0) {
            logger.info(`🎯 Fallback: ${matchedProducts.length} produtos correspondentes a "${searchTerm}" encontrados em ofertas.`);
            return matchedProducts;
        }

        // Se nenhum corresponder especificamente, retorna array vazio para evitar flood de duplicatas genéricas no mesmo ciclo
        logger.info(`ℹ️ Fallback: Nenhuma oferta direta de "${searchTerm}" foi encontrada nas ofertas da categoria. Retornando vazio para evitar duplicação de itens.`);
        return [];

    } catch (err) {
        logger.error(`❌ Erro no Fallback de Ofertas por Categoria:`, err.message);
    }
    return [];
};

/**
 * Busca produtos no Mercado Livre.
 * Tenta Scraper Direto -> Scraper via Proxy (Stealth) -> API Fallback -> Fallback de Ofertas por Categoria.
 */
const searchProducts = async (searchTerm, category = '') => {
    // Se o termo for "ofertas", usamos o buscador de ofertas dedicado
    if (searchTerm.toLowerCase().includes('oferta')) {
        const deals = await searchDailyDeals();
        if (deals.length > 0) return deals;
    }

    logger.info(`🔍 Buscando produtos no Mercado Livre para: "${searchTerm}"...`);
    
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1'
    ];

    try {
        const cacheBuster = Math.floor(Math.random() * 100);
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
        
        const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];

        logger.info(`🔌 Tentativa Direta (Simples) para: ${searchTerm}...`);
        
        const headers = {
            'User-Agent': selectedUA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        if (env.mlCookieString) {
            headers['Cookie'] = env.mlCookieString;
        }
        
        const { data: html, status } = await axios.get(url, {
            headers,
            timeout: 10000,
            validateStatus: () => true
        });

        if (status === 403 || html.includes('id="captcha"') || html.includes('g-recaptcha') || html.includes('Forbidden')) {
            logger.warn(`⚠️ Bloqueio direto detectado (Status ${status}). Ativando Modo Stealth...`);
            const stealthResult = await searchViaStealthProxy(searchTerm, category);
            if (stealthResult && stealthResult.length > 0) return stealthResult;
            
            return await searchCategoryDealsFallback(searchTerm);
        }

        const products = parseProducts(html, searchTerm);
        
        if (products.length === 0) {
            logger.info(`ℹ️ 0 produtos no scraper direto para "${searchTerm}". Tentando Modo Stealth...`);
            const stealthResult = await searchViaStealthProxy(searchTerm, category);
            if (stealthResult && stealthResult.length > 0) return stealthResult;
            
            return await searchCategoryDealsFallback(searchTerm);
        }

        logger.info(`✅ Sucesso no Scraper Direto para "${searchTerm}" (${products.length} itens).`);
        return products;
        
    } catch (error) {
        logger.warn(`⚠️ Erro no Scraper Direto (${error.message}). Tentando Modo Stealth...`);
        const stealthResult = await searchViaStealthProxy(searchTerm, category);
        if (stealthResult && stealthResult.length > 0) return stealthResult;
        
        return await searchCategoryDealsFallback(searchTerm);
    }
};




// Existing constants and PRODUCT_BLACKLIST remain unchanged above this insertion point.

/**
 * Enriquecimento detalhado de um produto usando scraping da página individual.
 * Retorna um objeto aumentado contendo descrição completa, atributos técnicos e reputação do vendedor.
 */
async function enrichProductDetails(product) {
  if (!product || !product.link) return product;
  try {
    // Utiliza um proxy stealth (AllOrigins) para contornar bloqueios de IP
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(product.link)}`;
    const { data } = await axios.get(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const html = data && data.contents ? data.contents : data;
    const $ = cheerio.load(html);

    // Descrição completa
    const description = $('.ui-pdp-description__content').text().trim();
    // Atributos técnicos (tabela de especificações)
    const attributes = {};
    $('.ui-pdp-specs__table tr').each((_, row) => {
      const key = $(row).find('th').text().trim();
      const value = $(row).find('td').text().trim();
      if (key && value) attributes[key] = value;
    });
    // Reputação do vendedor
    const sellerInfo = $('.ui-seller-info').text().trim();

    // Anexar ao objeto original
    product.fullDescription = description || product.description;
    product.attributes = attributes;
    product.sellerInfo = sellerInfo;
  } catch (e) {
    logger.warn(`⚠️ Falha ao enriquecer produto ${product.id}: ${e.message}`);
  }
  return product;
}

/**
 * Busca ofertas reais diretamente de uma categoria na aba de Ofertas do Mercado Livre
 */
const searchDealsByCategory = async (categoryId, offset = 1) => {
  const fakeIP = getRandomBrIP();
  const dealsUrl = `https://www.mercadolivre.com.br/ofertas?category=${categoryId}&_Desde=${offset}`;
  logger.info(`🔎 Buscando ofertas reais na categoria ${categoryId} (Offset: ${offset})...`);
  
  try {
      const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'X-Forwarded-For': fakeIP,
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
      };

      if (env.mlCookieString) {
          headers['Cookie'] = env.mlCookieString;
      }

      const { data: html, status } = await axios.get(dealsUrl, {
          headers,
          timeout: 12000,
          validateStatus: () => true
      });

      if (status === 403 || html.includes('id="captcha"') || html.includes('g-recaptcha') || html.includes('Forbidden')) {
          logger.warn(`⚠️ Bloqueio na aba de ofertas (Status ${status}). Tentando com proxy...`);
          // Tentativa com proxy translate
          const proxyUrl = `https://translate.google.com/translate?sl=en&tl=pt&u=${encodeURIComponent(dealsUrl)}`;
          try {
              const response = await axios.get(proxyUrl, {
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                      'Accept-Language': 'pt-BR,pt;q=0.9'
                  },
                  timeout: 15000
              });
              const products = parseProducts(response.data, `Ofertas ${categoryId}`, true);
              if (products.length > 0) return products;
          } catch (err) {
              logger.warn(`⚠️ Falha no proxy translate para ofertas: ${err.message}`);
          }
          return [];
      }

      const products = parseProducts(html, `Ofertas ${categoryId}`);
      logger.info(`✅ Sucesso na busca de ofertas para ${categoryId} (${products.length} itens encontrados).`);
      return products;
  } catch (error) {
      logger.error(`❌ Erro ao buscar ofertas na categoria ${categoryId}: ${error.message}`);
      return [];
  }
};

module.exports = {
  searchProducts,
  searchDailyDeals,
  searchDealsByCategory,
  enrichProductDetails,
  isProductBlacklisted,
  getCategoryForKeyword
};
