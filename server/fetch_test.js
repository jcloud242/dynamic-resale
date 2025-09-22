const http = require('http');
const https = require('https');

function run() {
  const data = JSON.stringify({ query: 'animal crossing new horizons' });
  const opts = {
    hostname: 'localhost',
    port: 5001,
    path: '/api/search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  const client = http;
  const start = Date.now();
  const req = client.request(opts, (res) => {
    const headers = res.headers;
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const durationMs = Date.now() - start;
      console.log('statusCode:', res.statusCode);
      console.log('X-Server-Duration-ms:', headers['x-server-duration-ms']);
      console.log('X-Request-Id:', headers['x-request-id']);
      console.log('Content-Length:', headers['content-length']);
      console.log('clientRoundtripMs:', durationMs);
      console.log('bodyLen:', body.length);
    });
  });

  req.on('error', (err) => {
    console.error('request error', err);
  });
  req.write(data);
  req.end();
}

run();
