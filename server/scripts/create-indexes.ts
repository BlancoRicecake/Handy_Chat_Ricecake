/**
 * MongoDB Index Creation Script
 *
 * Creates all necessary indexes for optimal query performance.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npx ts-node scripts/create-indexes.ts
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatdb';

interface IndexDefinition {
  collection: string;
  name: string;
  keys: Record<string, number | string>;
  options?: Record<string, any>;
}

const indexes: IndexDefinition[] = [
  // Users collection
  {
    collection: 'users',
    name: 'username_unique',
    keys: { username: 1 },
    options: { unique: true },
  },

  // Messages collection
  {
    collection: 'messages',
    name: 'roomId_createdAt',
    keys: { roomId: 1, createdAt: -1 },
  },
  {
    collection: 'messages',
    name: 'senderId_createdAt',
    keys: { senderId: 1, createdAt: -1 },
  },

  // Rooms collection
  {
    collection: 'rooms',
    name: 'participants_array',
    keys: { participants: 1 },
  },
  {
    collection: 'rooms',
    name: 'type',
    keys: { type: 1 },
  },

  // RefreshTokens collection
  {
    collection: 'refreshtokens',
    name: 'userId_isRevoked',
    keys: { userId: 1, isRevoked: 1 },
  },
  {
    collection: 'refreshtokens',
    name: 'jti_unique',
    keys: { jti: 1 },
    options: { unique: true },
  },
  {
    collection: 'refreshtokens',
    name: 'expiresAt_ttl',
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  },
];

async function createIndexes() {
  const client = new MongoClient(MONGO_URI);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected successfully\n');

    const db = client.db();

    for (const indexDef of indexes) {
      try {
        const collection = db.collection(indexDef.collection);

        // Check if index already exists
        const existingIndexes = await collection.indexes();
        const exists = existingIndexes.some((idx) => idx.name === indexDef.name);

        if (exists) {
          console.log(`✓ Index "${indexDef.name}" already exists on "${indexDef.collection}"`);
          continue;
        }

        // Create index
        await collection.createIndex(indexDef.keys, {
          name: indexDef.name,
          ...indexDef.options,
        });

        console.log(`✅ Created index "${indexDef.name}" on "${indexDef.collection}"`);
      } catch (error) {
        console.error(`❌ Failed to create index "${indexDef.name}": ${error.message}`);
      }
    }

    console.log('\n✅ Index creation completed');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run if called directly
if (require.main === module) {
  createIndexes().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { createIndexes };
