const io = require('socket.io-client');

const ROOM_ID = '690ef4652846ccf228ff7272';

const USER1_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTFmZmRmYTEyMTI4NmViYTk2NmU5MDYiLCJ1c2VybmFtZSI6InRlc3R1c2VyMSIsImlhdCI6MTc2MzcwNDQ4MSwiZXhwIjoxNzY0MzA5MjgxfQ.ZZZYTPk-S3KQOxAXcE7e5xo83gJ6FK3kAClqUVLMbZY';
const USER2_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTFmZmRmYzEyMTI4NmViYTk2NmU5MDkiLCJ1c2VybmFtZSI6InRlc3R1c2VyMiIsImlhdCI6MTc2MzcwNDUwMywiZXhwIjoxNzY0MzA5MzAzfQ.2p_F0VA5Nam_J8Y8K4X2q0Z6NwxhplXdCPcCeHRRuIY';

function createClient(userId, token, color) {
  const socket = io('http://localhost', {
    auth: { token },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log(`\x1b[${color}m[${userId}] Connected to server\x1b[0m`);

    // Join the room
    socket.emit('join', { roomId: ROOM_ID });
    console.log(`\x1b[${color}m[${userId}] Joined room ${ROOM_ID}\x1b[0m`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`\x1b[${color}m[${userId}] Disconnected: ${reason}\x1b[0m`);
  });

  socket.on('error', (error) => {
    console.error(`\x1b[${color}m[${userId}] Error: ${error}\x1b[0m`);
  });

  socket.on('message', (data) => {
    console.log(`\x1b[${color}m[${userId}] Received message:\x1b[0m`, JSON.stringify(data, null, 2));
  });

  socket.on('ack', (data) => {
    console.log(`\x1b[${color}m[${userId}] Message acknowledged:\x1b[0m`, data);
  });

  socket.on('typing', (data) => {
    console.log(`\x1b[${color}m[${userId}] User ${data.userId} is typing...\x1b[0m`);
  });

  socket.on('presence', (data) => {
    console.log(`\x1b[${color}m[${userId}] Presence update:\x1b[0m`, data);
  });

  return socket;
}

async function runTest() {
  console.log('=== Starting Real-time Chat Test ===\n');

  // Create two clients
  const user1 = createClient('user1', USER1_TOKEN, '36'); // Cyan
  const user2 = createClient('user2', USER2_TOKEN, '35'); // Magenta

  // Wait for connections
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n=== Test 1: User1 sends message to User2 ===');
  const msg1Id = `msg-${Date.now()}-1`;
  user1.emit('message', {
    roomId: ROOM_ID,
    clientMessageId: msg1Id,
    type: 'text',
    text: 'Hello User2! This is User1 speaking.'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n=== Test 2: User2 typing indicator ===');
  user2.emit('typing', { roomId: ROOM_ID });

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n=== Test 3: User2 replies to User1 ===');
  const msg2Id = `msg-${Date.now()}-2`;
  user2.emit('message', {
    roomId: ROOM_ID,
    clientMessageId: msg2Id,
    type: 'text',
    text: 'Hi User1! I got your message. Real-time chat is working!'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n=== Test 4: User1 typing and sending another message ===');
  user1.emit('typing', { roomId: ROOM_ID });
  await new Promise(resolve => setTimeout(resolve, 800));

  const msg3Id = `msg-${Date.now()}-3`;
  user1.emit('message', {
    roomId: ROOM_ID,
    clientMessageId: msg3Id,
    type: 'text',
    text: 'Awesome! The chat system is working perfectly!'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n=== Test Complete ===');
  console.log('Disconnecting clients...\n');

  user1.disconnect();
  user2.disconnect();

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

runTest().catch(console.error);
