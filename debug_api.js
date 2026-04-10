const axios = require('axios');
const logger = { info: console.log, error: console.error };

const fetchFromBackupAPI = async (searchTerm) => {
    try {
        console.log(`🔌 Tentando API de Backup (Mobile UserAgent) para: ${searchTerm}...`);
        const apiUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=10`;
        
        const { data } = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
                'Accept': 'application/json'
            }
        });
        
        console.log(`API returned ${data.results.length} results.`);
        return data.results;
    } catch (apiErr) {
        console.error(`❌ Falha na API: ${apiErr.message}`);
        if (apiErr.response) {
            console.error(`Status: ${apiErr.response.status}`);
            console.error(apiErr.response.data);
        }
        return [];
    }
};

fetchFromBackupAPI('Xiaomi');
