const express = require('express');
const cors = require('cors');
const path = require('path');
const { getEbayAppToken } = require('./ebayAuth');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Example search endpoint stub — returns mock results
app.post('/api/search', async (req, res) => {
  try {
    // In future use: const token = await getEbayAppToken();
    const { query } = req.body;
    // Return a mocked result set for now
    const mock = {
      query,
      title: query || 'Mock Item Title',
      upc: '012345678905',
      categoryId: '139973',
      thumbnail: '/vite.svg',
      avgPrice: 42.5,
      minPrice: 10,
      maxPrice: 120,
      soldListings: [
        { id: 1, title: 'Mock sold 1', price: 40, url: '#' },
        { id: 2, title: 'Mock sold 2', price: 45, url: '#' },
      ],
    };
    res.json(mock);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'search-failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
