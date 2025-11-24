const io = require('socket.io-client');

const API_URL = 'http://localhost';

async function createTestData() {
  console.log('=== Creating Test Data for Pagination ===\n');

  // 1. Register two users
  console.log('1. Registering users...');
  const user1Res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pass123' })
  });
  const user1 = await user1Res.json();
  console.log('User1 (alice):', user1.token.substring(0, 30) + '...');

  const user2Res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'pass123' })
  });
  const user2 = await user2Res.json();
  console.log('User2 (bob):', user2.token.substring(0, 30) + '...\n');

  // 2. Create room
  console.log('2. Creating chat room...');
  const roomRes = await fetch(`${API_URL}/rooms/ensure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user1.token}`
    },
    body: JSON.stringify({ otherUserId: user2.userId })
  });
  const room = await roomRes.json();
  console.log('Room created:', room._id, '\n');

  // 3. Send 50 messages to test pagination
  console.log('3. Sending 50 messages (to test pagination)...');

  const socket1 = io(API_URL, {
    auth: { token: user1.token },
    transports: ['websocket', 'polling']
  });

  const socket2 = io(API_URL, {
    auth: { token: user2.token },
    transports: ['websocket', 'polling']
  });

  await new Promise(resolve => {
    let connected = 0;
    socket1.on('connect', () => {
      socket1.emit('join', { roomId: room._id });
      connected++;
      if (connected === 2) resolve();
    });
    socket2.on('connect', () => {
      socket2.emit('join', { roomId: room._id });
      connected++;
      if (connected === 2) resolve();
    });
  });

  console.log('Both users connected to room\n');

  // Send messages alternately
  for (let i = 1; i <= 50; i++) {
    const socket = i % 2 === 1 ? socket1 : socket2;
    const user = i % 2 === 1 ? 'Alice' : 'Bob';

    socket.emit('message', {
      roomId: room._id,
      clientMessageId: `msg-${Date.now()}-${i}`,
      type: 'text',
      text: `Message ${i} from ${user}`
    });

    if (i % 10 === 0) {
      console.log(`Sent ${i} messages...`);
    }

    // Small delay to avoid overwhelming server
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  socket1.disconnect();
  socket2.disconnect();

  console.log('\n=== Test Data Created ===');
  console.log(`Room ID: ${room._id}`);
  console.log(`Alice token: ${user1.token}`);
  console.log(`Bob token: ${user2.token}`);
  console.log('\n50 messages sent. You can now test pagination in the app!');
  console.log('\nTo test:');
  console.log('1. Open test-login-chat.html');
  console.log('2. Login as alice (password: pass123)');
  console.log(`3. Use Room ID: ${room._id}`);
  console.log('4. Connect to chat');
  console.log('5. Scroll up to load older messages');
}

createTestData().catch(console.error);
