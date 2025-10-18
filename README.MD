# gRPC File Upload Stream (Client ↔ Server)

## Overview

This project implements a **pure gRPC bidirectional streaming** system between a **server** and **multiple clients**.
It enables the **server to trigger a file upload** from the client, even when the client is behind **NAT or private networks**.

The design goal is **simplicity, reliability, and direct binary streaming**, without relying on HTTP frameworks or WebSocket tunnels.

---

## 1. Why choosing gRPC instead of WebSocket

We use **gRPC** because it's a **binary protocol over HTTP/2** that provides **streaming and flow control out of the box**, making it ideal for large file transfers and persistent connections.

### Advantages

* **Native streaming**: gRPC supports full-duplex (bidirectional) streaming, no need to manually handle binary framing or chunk reassembly like in WebSocket.
* **No dependency on HTTP routing**: gRPC doesn't rely on REST endpoints. The communication is **pure RPC-based**, so it's simpler for service-to-service or long-lived connections.
* **Type safety**: `.proto` definitions enforce strict message schemas between client and server.
* **Built-in retry and deadline** mechanisms.
* **Binary efficient**: gRPC serializes data using Protobuf, theoretically faster and smaller than JSON.

### In short

> We choose **gRPC** because it handles streaming natively, doesn't rely on HTTP or custom message framing, and is ideal for long-lived binary data transfers like file uploads.

---

## 2. Why not using any HTTP framework

This implementation avoids frameworks like **Express.js**, **NestJS**, or **Fastify** because:

* The server doesn't serve HTTP routes; it only needs to handle **gRPC requests**.
* We trigger uploads via **CLI commands** instead of API calls.
* It's lightweight and framework-agnostic.

If later we want to expose an API (e.g., to download files directly via HTTP), we can easily add:

* a simple built-in HTTP server, or
* integrate Express/NestJS on top of the same service.

### In short

> No framework is used because the server is purely a gRPC endpoint and CLI-triggered app, simpler, smaller, and easier to maintain.

---

## 3. Why the client must keep a persistent connection

Because most clients are deployed **behind NAT or private networks**, the server cannot open a direct TCP connection to them.

In other words:

* NAT/firewalls block **inbound** connections.
* Only **outbound** connections are allowed from client → server.

Thus, the client keeps a **long-lived gRPC stream** open, allowing:

* the server to send “upload” commands **down the stream**, and
* the client to push file data **up the same stream**.

### In short

> Clients must maintain persistent connections because the server can't initiate connections into private or NAT'd networks. The client “phones home” and keeps the line open.

---

## Architecture

```
          ┌───────────────────────────┐
          │        SERVER             │
          │ ───────────────────────── │
          │  gRPC Service (Uploader)  │
          │  - Trigger(clientId,path) │
          │  - DataStream(stream)     │
          └──────────▲────────────────┘
                     │
                     │ gRPC stream (bidirectional)
                     │
                     ▼
          ┌──────────────────────────┐
          │         CLIENT           │
          │ ──────────────────────── │
          │  gRPC Client (Uploader)  │
          │  - Keeps stream open     │
          │  - Handles upload_req    │
          │  - Streams file chunks   │
          └──────────────────────────┘
```

---

## Directory structure

```
server-client-grpc-upload-stream/
├── proto/
│   └── uploader.proto
│
├── client/
│   ├── data/
│   ├── node_modules/
│   ├── scripts/
│   │   └── make-sample.js
│   ├── src/
│   │   ├── common/
│   │   │   ├── helpers/
│   │   │   │   ├── grpc-cred.helper.ts
│   │   │   │   ├── enum.common.ts
│   │   │   │   └── helper.common.ts
│   │   ├── config/
│   │   │   └── env.config.ts
│   │   ├── client.ts
│   │   └── tsconfig.json
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
│
├── server/
│   ├── downloads/
│   ├── node_modules/
│   ├── src/
│   │   ├── common/
│   │   │   ├── helpers/
│   │   │   │   ├── grpc-cred.helper.ts
│   │   │   │   ├── enum.common.ts
│   │   │   │   └── helper.common.ts
│   │   ├── config/
│   │   │   └── env.config.ts
│   │   ├── server.ts
│   │   └── trigger-cli.ts
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md

```

---

## Setup Guide

### 1. Prerequisites

* Node.js ≥ 18
* npm or yarn
* Basic understanding of gRPC & TypeScript

### 2. Install dependencies

```bash
cd server && npm i
```

Open another tab of terminal, then
```bash
cd client && npm i
```


---

## Running

### Start the Server

```bash
cd server
cp .env.example .env
npm run dev
# => SERVER: gRPC listening on port 50051
```

### Start the Client

```bash
cd client
cp .env.example .env
node scripts/make-sample 50
# generate a 50MB sample file. Default to 100MB
npm run dev
# => CLIENT: connected and sent hello
```

### Trigger file upload

On the **server** terminal:

```bash
npm run trigger -- client-001 ./data/sample.bin
```

Expected:

* Server logs file receiving progress
* Client logs file upload completion
* File is saved under `server/downloads/`

---

## SSL/TLS in Production

When deploying gRPC to production, always enable SSL/TLS to protect data in transit.
Use certificate-based credentials instead of insecure ones:
  - Server -> Use grpc.ServerCredentials.createSsl() with your server.crt and server.key.
  - Client -> Use grpc.credentials.createSsl() with the trusted ca.crt that signed the server certificate.


Typical setup:
```
certs/
├── ca.crt          # Certificate authority
├── server.crt      # Server certificate
└── server.key      # Server private key
```

In local or development environments, you can still use insecure mode. **Never use insecure mode in production**.

---

## Environment variables

### Server `.env`

```bash
GRPC_PORT=50051
CLIENT_SHARED_SECRET=dev-client-secret
DOWNLOAD_DIR=./downloads
GRPC_SSL_CERT_PATH=
GRPC_SSL_KEY_PATH=
GRPC_SSL_CA_PATH=
```

### Client `.env`

```bash
GRPC_ADDR=localhost:50051
CLIENT_ID=client-001
CLIENT_SHARED_SECRET=dev-client-secret
FILE_PATH=./data/sample.bin
CHUNK_BYTES=1048576
GRPC_SSL_CA_PATH=
```

---

## Retry Mechanism

The client's `connectWithRetry()` keeps retrying indefinitely if the connection drops, using **exponential backoff with jitter**. It:
  - Keeps connection alive
  - Recovers from network loss automatically
  - No manual restart required

---

## CLI commands

### Trigger client upload (on Server)

```bash
npm run trigger -- <clientId> <filePath>
```

Example:

```bash
npm run trigger -- client-001 ./data/sample.bin
```

### Generate sample file (on Client)

```bash
node scripts/make-sample -- 50
# generates 50 MB file at ./data/sample.bin. default to 100 if no arg
```

---

## Shared contract (`uploader.proto`)

```proto
syntax = "proto3";

package uploader;

service Uploader {
  rpc DataStream(stream StreamMsg) returns (stream StreamMsg);
  rpc Trigger(TriggerReq) returns (TriggerRes);
}

message StreamMsg {
  oneof kind {
    Hello hello = 1;
    ClientReady ready = 2;
    UploadRequest upload_req = 3;
    FileChunk chunk = 4;
    Complete complete = 5;
    ErrorMsg error = 6;
  }
}

message Hello { string client_id = 1; string secret = 2; }
message ClientReady { string client_id = 1; }
message UploadRequest { string upload_id = 1; string file_path = 2; }
message FileChunk { string upload_id = 1; uint64 seq = 2; bytes data = 3; bool last = 4; }
message Complete { string upload_id = 1; uint64 size = 2; string sha256 = 3; }
message ErrorMsg { string upload_id = 1; string code = 2; string message = 3; }
message TriggerReq { string client_id = 1; string file_path = 2; }
message TriggerRes { string upload_id = 1; string status = 2; }
```

---

## Future Extensions

| Feature           | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| Authentication    | Replace shared secret with JWT or mTLS                                     |
| HTTP Download API | Add lightweight HTTP endpoint (Express/Fastify) for retrieving saved files |
| Cloud Storage     | Stream directly to S3 / GCS                                                |
| Observability     | Add monitoring, logging, tracing                                           |
| Client health     | Periodic heartbeat / ping-pong messages                                    |

---

## Summary

| Topic                         | Reason                                                                    |
| ----------------------------- | ------------------------------------------------------------------------- |
| **gRPC instead of WebSocket** | Handles binary streaming out of the box, typed schema, no HTTP dependency |
| **No HTTP framework**         | Lightweight CLI-triggered design; easier to extend later                  |
| **Client keeps connection**   | NAT/private network safe, only clients can initiate connections           |
| **Retry & resilience**        | Auto-reconnect loop ensures always-available pipeline                     |

---

**In short:**

> This project provides a **minimal, production-ready gRPC streaming system** where the **server can request files from NAT'd clients**, with **strong typing, efficient binary transfer**, and **no framework overhead**, just TypeScript, gRPC, and Node.

---