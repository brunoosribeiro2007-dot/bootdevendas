const axios = require('axios');

async function checkRedirect(url) {
  try {
    const res = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 300 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
      }
    });
    console.log(`URL: ${url} redirects to: ${res.headers.location}`);
  } catch (e) {
    console.error(`Error resolving ${url}: ${e.message}`);
    if (e.response) {
      console.log(`Status: ${e.response.status}`);
      console.log(`Headers:`, e.response.headers);
    }
  }
}

// Check some of the links
checkRedirect('https://meli.la/1v5Y1an');
