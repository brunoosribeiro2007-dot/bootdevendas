const axios = require('axios');

async function testApi() {
  const url = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
  const itemUrl = 'https://produto.mercadolivre.com.br/MLB-4632890666-kit-10-cabides-infantil-acrilico-cristal-transparente-cava-_JM'; // Random product
  const tag = 'bv20260330080614';
  
  const payloads = [
    { source: itemUrl, tag: tag },
    { url: itemUrl, tag: tag },
    { link: itemUrl, tag: tag },
    { affiliate: tag, link: itemUrl },
    { url: itemUrl, affiliate: tag, tag: tag },
  ];
  
  for (const payload of payloads) {
    try {
        console.log('Trying payload:', payload);
        const res = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Success!', res.data);
    } catch (e) {
        console.log('Failed:', e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data)) : e.message);
    }
  }
}

testApi();
