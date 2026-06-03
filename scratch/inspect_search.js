const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function inspect() {
    const searchTerm = 'Xiaomi';
    const cacheBuster = Math.floor(Math.random() * 100);
    const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_Discount_10-100_NoIndex_True?b=${cacheBuster}`;
    
    console.log('Requesting URL:', url);
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    try {
        const response = await axios.get(url, {
            headers,
            timeout: 10000,
            validateStatus: () => true
        });

        console.log('Response Status:', response.status);
        console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
        console.log('Response Body Length:', response.data ? response.data.length : 0);
        
        if (response.data) {
            const preview = response.data.substring(0, 2000);
            console.log('--- Body Preview ---');
            console.log(preview);
            console.log('--- End of Preview ---');
            
            // Check if there are common elements
            const hasCaptcha = response.data.includes('captcha') || response.data.includes('challenge') || response.data.includes('g-recaptcha');
            console.log('Has CAPTCHA/Challenge text:', hasCaptcha);
            
            // Let's write the response to a temp file to inspect if needed
            const logPath = path.join(__dirname, 'last_response.html');
            fs.writeFileSync(logPath, response.data);
            console.log('Full HTML saved to:', logPath);
        }
    } catch (error) {
        console.error('Error during inspect:', error);
    }
}

inspect();
