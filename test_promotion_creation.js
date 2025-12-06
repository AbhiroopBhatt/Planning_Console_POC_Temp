/**
 * Test script to create a promotion with product 1 and customer 4
 * Run with: node test_promotion_creation.js
 */

const http = require('http');

// Configuration
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 3001;
const API_PATH = '/api/promotions/create-fact';

// Test data - using product 1 and customer 4
// Using a small date range for testing (first 7 days)
const testData = {
  productIds: [1],
  customerIds: [4],
  regionIds: [1], // Assuming region 1 exists - adjust if needed
  channelIds: [1], // Assuming channel 1 exists - adjust if needed
  startDate: '2025-01-01', // Based on time.csv data
  endDate: '2025-01-07',   // 7 days for testing
  discountPct: 10 // 10% discount
};

// Make the API request
const postData = JSON.stringify(testData);

const options = {
  hostname: API_HOST,
  port: API_PORT,
  path: API_PATH,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Testing promotion creation...');
console.log('Request data:', JSON.stringify(testData, null, 2));
console.log(`\nSending POST request to http://${API_HOST}:${API_PORT}${API_PATH}\n`);

const req = http.request(options, (res) => {
  let data = '';

  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('\n=== Response ===');
      console.log(JSON.stringify(response, null, 2));
      
      if (response.success) {
        console.log('\n✅ Promotion created successfully!');
        console.log(`Promotion ID: ${response.data.promotion_id}`);
        console.log(`Records created: ${response.data.record_count}`);
      } else {
        console.log('\n❌ Promotion creation failed!');
        console.log(`Error: ${response.error}`);
        if (response.details) {
          console.log(`Details: ${response.details}`);
        }
      }
    } catch (e) {
      console.log('\n❌ Failed to parse response');
      console.log('Raw response:', data);
      console.error('Parse error:', e.message);
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request error:', error.message);
  console.error('Make sure the backend server is running on', `${API_HOST}:${API_PORT}`);
});

req.write(postData);
req.end();
