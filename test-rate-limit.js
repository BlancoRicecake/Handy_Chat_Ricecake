const io = require('socket.io-client');
const http = require('http');

const API_URL = 'http://localhost';

async function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
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

async function testRateLimit() {
  console.log('=== WebSocket Rate Limit Test ===\n');

  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    let authData;
    try {
      const username = `testuser-${Date.now()}`;
      authData = await fetchJSON(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'test1234' }),
      });
      console.log(`✓ Registered: ${authData.username}`);
    } catch (error) {
      authData = await fetchJSON(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'test1234' }),
      });
      console.log(`✓ Logged in: ${authData.username}`);
    }

    const token = authData.token;

    // Step 2: Connect to WebSocket
    console.log('\nStep 2: Connecting to WebSocket...');
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve) => {
      socket.on('connect', () => {
        console.log('✓ Connected to WebSocket');
        resolve();
      });
    });

    // Step 3: Join a room
    console.log('\nStep 3: Joining room...');
    socket.emit('join', { roomId: 'test-room' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log('✓ Joined room');

    // Step 4: Test message rate limiting
    console.log('\nStep 4: Testing message rate limit (10 messages/second)...');
    console.log('Sending 20 messages as fast as possible...\n');

    let sentCount = 0;
    let ackCount = 0;
    let errorCount = 0;

    socket.on('ack', () => {
      ackCount++;
    });

    socket.on('error', (error) => {
      errorCount++;
      console.log(`⚠️  Rate limit triggered: ${error}`);
    });

    socket.on('exception', (error) => {
      errorCount++;
      console.log(`⚠️  Exception (rate limit): ${error.message || JSON.stringify(error)}`);
    });

    // Send 20 messages rapidly
    for (let i = 0; i < 20; i++) {
      socket.emit('message', {
        roomId: 'test-room',
        clientMessageId: `test-${Date.now()}-${i}`,
        type: 'text',
        text: `Test message ${i + 1}`,
      });
      sentCount++;
    }

    // Wait for responses
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\n=== Results ===');
    console.log(`Messages sent: ${sentCount}`);
    console.log(`ACKs received: ${ackCount}`);
    console.log(`Errors/throttled: ${errorCount}`);

    if (ackCount < sentCount) {
      console.log(
        `\n✓ Rate limiting is working! ${sentCount - ackCount} messages were throttled.`,
      );
    } else {
      console.log(
        '\n⚠️  Warning: All messages were accepted. Rate limiting may not be working correctly.',
      );
    }

    // Test typing rate limit
    console.log('\n\nStep 5: Testing typing event rate limit (5 events/second)...');
    console.log('Sending 10 typing events as fast as possible...\n');

    for (let i = 0; i < 10; i++) {
      socket.emit('typing', { roomId: 'test-room' });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('✓ Typing events sent (check server logs for throttling)');

    socket.disconnect();
    console.log('\n=== Test completed ===');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  }
}

testRateLimit();
