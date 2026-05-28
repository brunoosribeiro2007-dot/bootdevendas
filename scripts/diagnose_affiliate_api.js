const axios = require('axios');
require('dotenv').config();

const apiUrl = process.env.ML_AFFILIATE_API_URL || 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
const tag = process.env.ML_AFFILIATE_TAG;
const testUrl = process.argv[2] || 'https://www.mercadolivre.com.br/kit-2-cameras-seguranca-wifi-360-externa-full-hd-branco/up/MLBU3784116314';

const safePrint = (label, obj) => {
  try {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    console.log(`--- ${label} ---`);
    console.log(s.length > 5000 ? s.slice(0, 5000) + '\n... (truncated)' : s);
  } catch (e) { console.log(label, obj); }
};

const run = async () => {
  console.log('API URL:', apiUrl);
  console.log('Test URL:', testUrl);
  console.log('Using tag from env:', !!tag);

  const postVariants = [
    { url: testUrl, tag },
    { source: testUrl, tag },
    { link: testUrl, affiliate: tag },
    { resource: testUrl, affiliate: tag },
  ];

  for (const body of postVariants) {
    try {
      console.log('\nPOST body:', body);
      const res = await axios.post(apiUrl, body, { timeout: 8000 });
      safePrint('POST response data', res.data);
      safePrint('POST response headers', res.headers);
    } catch (err) {
      console.error('POST error:', err.message);
      if (err.response) {
        safePrint('POST error response data', err.response.data);
        safePrint('POST error response headers', err.response.headers);
      }
    }
  }

  const getVariants = [
    `?url=${encodeURIComponent(testUrl)}&tag=${encodeURIComponent(tag)}`,
    `?source=${encodeURIComponent(testUrl)}&affiliate=${encodeURIComponent(tag)}`,
    `?link=${encodeURIComponent(testUrl)}&affiliate=${encodeURIComponent(tag)}`,
  ];

  for (const q of getVariants) {
    try {
      console.log('\nGET:', apiUrl + q);
      const res = await axios.get(apiUrl + q, { timeout: 8000 });
      safePrint('GET response data', res.data);
      safePrint('GET response headers', res.headers);
    } catch (err) {
      console.error('GET error:', err.message);
      if (err.response) {
        safePrint('GET error response data', err.response.data);
        safePrint('GET error response headers', err.response.headers);
      }
    }
  }
};

run().catch(e => { console.error('Fatal error:', e); process.exit(1); });
