const axios = require('axios');

const getRandomBrIP = () => {
    const bases = ['177', '179', '186', '187', '189', '191', '200', '201'];
    const base = bases[Math.floor(Math.random() * bases.length)];
    return `${base}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
};

async function run() {
  try {
    const fakeIP = getRandomBrIP();
    const domain = 'api.mercadolibre.com';
    const searchTerm = 'Cadeira';
    const apiUrl = `https://${domain}/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=5&sort=relevance&condition=new`;
    
    const { data } = await axios.get(apiUrl, {
        headers: {
            'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
            'X-Forwarded-For': fakeIP,
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
            'Accept': 'application/json'
        },
        timeout: 8000
    });
    console.log(JSON.stringify(data.results[0], null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
run();
