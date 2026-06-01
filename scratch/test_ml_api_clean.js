const axios = require('axios');

async function run() {
  try {
    const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/search?q=cadeira&limit=5');
    console.log(JSON.stringify(data.results[0], null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
run();
