const axios = require('axios');

const testApi = async () => {
    try {
        const url = 'https://api.mercadolibre.com/sites/MLB/search?q=Xiaomi&limit=1';
        const { data } = await axios.get(url);
        console.log("Success! Found:", data.results[0].title);
    } catch (e) {
        console.log("Failed:", e.message);
        if (e.response) console.log("Status:", e.response.status, e.response.data);
    }
};

testApi();
