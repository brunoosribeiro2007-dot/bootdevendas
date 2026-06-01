const axios = require('axios');

async function run() {
  try {
    const targetUrl = 'https://api.mercadolibre.com/sites/MLB/search?q=cadeira&limit=5';
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    
    const { data } = await axios.get(proxyUrl);
    const parsedData = JSON.parse(data.contents);
    
    console.log(JSON.stringify(parsedData.results[0], null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
run();
