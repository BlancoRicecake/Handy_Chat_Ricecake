const io = require('socket.io-client');

const API_URL = 'http://localhost';
const ROOM_ID = '690ef4652846ccf228ff7272';

const USER1_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTFmZmRmYTEyMTI4NmViYTk2NmU5MDYiLCJ1c2VybmFtZSI6InRlc3R1c2VyMSIsImlhdCI6MTc2MzcwNDQ4MSwiZXhwIjoxNzY0MzA5MjgxfQ.ZZZYTPk-S3KQOxAXcE7e5xo83gJ6FK3kAClqUVLMbZY';
const USER2_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTFmZmRmYzEyMTI4NmViYTk2NmU5MDkiLCJ1c2VybmFtZSI6InRlc3R1c2VyMiIsImlhdCI6MTc2MzcwNDUwMywiZXhwIjoxNzY0MzA5MzAzfQ.2p_F0VA5Nam_J8Y8K4X2q0Z6NwxhplXdCPcCeHRRuIY';

async function createPaginationTestData() {
  console.log('=== Creating Pagination Test Data ===\n');

  const socket1 = io(API_URL, {
    auth: { token: USER1_TOKEN },
    transports: ['websocket', 'polling']
  });

  const socket2 = io(API_URL, {
    auth: { token: USER2_TOKEN },
    transports: ['websocket', 'polling']
  });

  await new Promise(resolve => {
    let connected = 0;
    socket1.on('connect', () => {
      socket1.emit('join', { roomId: ROOM_ID });
      connected++;
      if (connected === 2) resolve();
    });
    socket2.on('connect', () => {
      socket2.emit('join', { roomId: ROOM_ID });
      connected++;
      if (connected === 2) resolve();
    });
  });

  console.log('Both users connected to room\n');
  console.log('Sending 50 messages for pagination test...');

  let ackCount = 0;
  socket1.on('ack', () => ackCount++);
  socket2.on('ack', () => ackCount++);

  // Send messages alternately with delay to avoid rate limiting
  for (let i = 1; i <= 50; i++) {
    const socket = i % 2 === 1 ? socket1 : socket2;
    const user = i % 2 === 1 ? 'testuser1' : 'testuser2';

    socket.emit('message', {
      roomId: ROOM_ID,
      clientMessageId: `pagination-test-${Date.now()}-${i}`,
      type: 'text',
      text: `Pagination test message ${i} from ${user}`
    });

    if (i % 10 === 0) {
      console.log(`Sent ${i} messages...`);
    }

    // Delay to avoid rate limiting (10 msgs/sec = 100ms delay)
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  socket1.disconnect();
  socket2.disconnect();

  console.log(`\n=== Test Data Created ===`);
  console.log(`Total messages sent: 50`);
  console.log(`ACKs received: ${ackCount}`);
  console.log(`\nYou can now test pagination by fetching messages from the room.`);
}

createPaginationTestData().catch(console.error);
