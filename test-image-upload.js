const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Disable SSL verification for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_URL = 'https://localhost:8443';

async function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function uploadFile(url, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const fileData = fs.readFileSync(filePath);

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileData.length
      },
      rejectUnauthorized: false
    };

    // Use http or https based on URL protocol
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileData);
    req.end();
  });
}

async function testImageUpload() {
  console.log('=== Image Upload Test ===\n');

  try {
    // Step 1: Register/Login
    console.log('Step 1: Registering user...');
    const username = `testuser-${Date.now()}`;
    const password = 'test1234';

    let authData;
    try {
      authData = await fetchJSON(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      console.log(`✓ Registered: ${authData.username}`);
    } catch (error) {
      console.log('Registration failed, trying login...');
      authData = await fetchJSON(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'test1234' })
      });
      console.log(`✓ Logged in: ${authData.username}`);
    }

    const token = authData.token;

    // Step 2: Get presigned URL
    console.log('\nStep 2: Getting presigned upload URL...');
    const presignedData = await fetchJSON(`${API_URL}/storage/presigned-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fileName: 'test-image.png',
        fileType: 'image/png'
      })
    });

    console.log(`✓ Got presigned URL`);
    console.log(`  Upload URL: ${presignedData.uploadUrl.substring(0, 80)}...`);
    console.log(`  File URL: ${presignedData.fileUrl}`);
    console.log(`  Key: ${presignedData.key}`);

    // Step 3: Upload file to MinIO
    console.log('\nStep 3: Uploading file to MinIO...');
    const testImagePath = path.join(__dirname, 'test-image.png');

    if (!fs.existsSync(testImagePath)) {
      throw new Error('test-image.png not found. Please create it first.');
    }

    const uploadResult = await uploadFile(presignedData.uploadUrl, testImagePath, 'image/png');
    console.log(`✓ File uploaded successfully (Status: ${uploadResult.statusCode})`);

    // Step 4: Verify by getting download URL
    console.log('\nStep 4: Verifying file with download URL...');
    const downloadData = await fetchJSON(
      `${API_URL}/storage/presigned-download/${encodeURIComponent(presignedData.key)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    console.log(`✓ Got download URL: ${downloadData.downloadUrl.substring(0, 80)}...`);

    console.log('\n=== ✓ All tests passed! ===');
    console.log('\nYou can now:');
    console.log(`1. Open test-login-chat.html in your browser`);
    console.log(`2. Login with username: testuser, password: test1234 (or create new account)`);
    console.log(`3. Connect to a chat room`);
    console.log(`4. Upload and send images!`);

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  }
}

testImageUpload();
