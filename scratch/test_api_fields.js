const axios = require('axios');
const getRandomBrIP = () => {
    const bases = ['177', '179', '186', '187', '189', '191', '200', '201'];
    const base = bases[Math.floor(Math.random() * bases.length)];
    return `${base}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
};
async function test() {
  try {
    const fakeIP = getRandomBrIP();
    const url = 'https://api.mercadolibre.com/sites/MLB/search?q=geladeira&limit=5';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'MercadoLibre/10.428.1 (iPhone; iOS 17.5.1; Mobile/21F90)',
        'X-Forwarded-For': fakeIP,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept': 'application/json'
      }
    });
    if (res.data && res.data.results && res.data.results.length > 0) {
      const p = res.data.results[0];
      console.log("Product keys:", Object.keys(p));
      console.log("reviews object:", JSON.stringify(p.reviews || null, null, 2));
      console.log("rating_average:", p.rating_average);
    } else {
      console.log("No results or data structure different.");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
