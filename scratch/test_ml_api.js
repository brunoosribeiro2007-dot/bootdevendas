const axios = require('axios');

async function testCleanApi() {
    const searchTerm = 'Xiaomi';
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=10`;
    
    console.log('Testing URL:', url);
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };

    try {
        const response = await axios.get(url, {
            headers,
            timeout: 10000
        });

        console.log('Response Status:', response.status);
        console.log('Results count:', response.data.results ? response.data.results.length : 0);
        if (response.data.results && response.data.results.length > 0) {
            console.log('First product sample:', JSON.stringify({
                id: response.data.results[0].id,
                title: response.data.results[0].title,
                price: response.data.results[0].price,
                permalink: response.data.results[0].permalink
            }, null, 2));
        }
    } catch (error) {
        console.error('Error with clean request:', error.response ? `${error.response.status} ${JSON.stringify(error.response.data)}` : error.message);
    }
}

testCleanApi();
