const axios = require('axios');
require('dotenv').config();

let cachedToken = null;
let tokenExpiry = 0;

async function getEbayAppToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = response.data;
    cachedToken = data.access_token;
    tokenExpiry = now + data.expires_in * 1000 - 60000;
    console.log('[eBayAuth] Token retrieved, expires in', data.expires_in, 'seconds');
    return cachedToken;
  } catch (err) {
    console.error('Failed to get eBay OAuth token:', err.message);
    throw new Error('eBay OAuth token request failed');
  }
}

module.exports = { getEbayAppToken };
