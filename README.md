# Chat Stack Scaffold (NestJS + Socket.IO + MongoDB)

This scaffold gives you a minimal, production-friendly starting point for a **1:1 chat** backend and a **React Native client snippet**.

## Stack Choices
- **Server**: Node.js + NestJS (TypeScript)
- **Realtime**: Socket.IO (WebSocket-first)
- **DB**: MongoDB (@nestjs/mongoose)
- **Cache (future)**: Redis (presence, scale-out)
- **Container**: Docker + docker-compose
- **Auth (scaffold)**: JWT verification on socket connection (simple example)

## Quick Start (Docker)
```bash
# 1) Copy env and edit values
cp server/.env.example server/.env

# 2) Build & run
docker compose up --build
# API: http://localhost:3000  (health: /health)
# Socket.IO: ws(s)://localhost:3000 (namespace: default)
```

## Local Dev (without Docker)
```bash
cd server
npm i
npm run start:dev
```

## Environment
`server/.env.example` includes:
```
PORT=3000
MONGO_URI=mongodb://mongo:27017/chatdb
JWT_SECRET=changeme-secret
CORS_ORIGIN=*
```

## Client (React Native)
See `mobile/ChatClient.tsx` for a drop-in example (Socket.IO). Replace `YOUR_API_URL` and integrate into your navigation or screen.

## Notes
- This is a **scaffold**: minimal logic to connect, join a room, send/receive messages, and ACK by `clientMessageId`.
- Room creation API is out of scope here; pass a known `roomId` to the client to join (or add your own REST endpoints later).
- For horizontal scaling, add the **Socket.IO Redis adapter** and move presence to Redis.
- Add file uploads (S3 presigned URLs) later—message schema already supports `fileUrl`.
```

Enjoy building! ✨
