const axios = require('axios');

async function run() {
  try {
    const { data } = await axios.get('https://api.mercadolibre.com/items/MLB3592182519');
    console.log(data.title);
  } catch (e) {
    console.error(e.message);
  }
}
run();
