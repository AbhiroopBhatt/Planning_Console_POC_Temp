/**
 * Test simple promotion creation without DuckDB
 */

const http = require('http');

const testData = {
  productIds: [1],
  customerIds: [4],
  regionIds: [1],
  channelIds: [1],
  startDate: '2025-01-01',
  endDate: '2025-01-01', // Just one day to minimize queries
  discountPct: 10
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/promotions/create-fact',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Testing with single date to minimize queries...');
console.log('Request:', JSON.stringify(testData, null, 2));

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('\n=== Response ===');
      console.log(JSON.stringify(response, null, 2));
      if (response.success) {
        console.log('\n✅ SUCCESS!');
      } else {
        console.log('\n❌ FAILED');
        if (response.details) console.log('Details:', response.details);
        if (response.code) console.log('Code:', response.code);
        if (response.detail) console.log('Detail:', response.detail);
        if (response.position) console.log('Position:', response.position);
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
});

req.write(postData);
req.end();

