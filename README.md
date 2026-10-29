# Distributed UPI Payment Gateway & Core Ledger Engine

A three-tier microservices UPI payment gateway featuring an asynchronous **Node.js API Gateway**, a low-latency **C++17 Core Transaction Engine** built over raw TCP sockets (`WinSock2`), and an interactive **Google Pay Checkout & NPCI Bank Switch Workbench**.

Designed from first principles to model production fintech guarantees: **idempotent request deduplication**, **HMAC-SHA256 webhook authentication**, **thread-safe deterministic state machines**, and **Write-Ahead Log (WAL) crash recovery**.

---

## System Architecture

```text
+-------------------------------------------------------------------------+
|                   Client & Simulator Tier (Port 4000)                   |
|  [ Google Pay Checkout UI ]              [ NPCI Bank Webhook Switch ]   |
+--------------+-------------------+-----------------------+--------------+
               |                   |                       |
   1. POST     |        2. GET     |            3. POST    | (Async Bank
   /checkout   |     /status/:id   |             /webhook  |  Callback +
   (Idempotent)|     (1.2s Poll)   |                       |  HMAC-SHA256)
               v                   v                       v
+-------------------------------------------------------------------------+
|                    API Gateway Tier - Node.js (Port 3000)               |
|  • TTL Idempotency Cache (Map + Background Eviction Worker)             |
|  • Cryptographic HMAC-SHA256 Signature Verification                     |
|  • Strict Environment Secret Validation (.env)                          |
+--------------+-------------------+-----------------------+--------------+
               |                   |                       |
   /internal   |       /internal   |           /internal   | (Raw HTTP over
     /init     |        /status    |            /update    |  WinSock2 TCP)
               v                   v                       v
+-------------------------------------------------------------------------+
|                  Core Ledger Engine - C++ (Port 8080)                   |
|  • WinSock2 TCP Server & Custom Zero-Dependency Payload Parser          |
|  • Thread-Safe State Machine (CRITICAL_SECTION Mutex Locks)             |
|  • Write-Ahead Audit Ledger (ledger.log) & Startup WAL Replay Recovery  |
+-------------------------------------------------------------------------+
```

---

## Core Engineering Pillars

### 1. Two-Layer Double-Spend & Replay Protection
* **Gateway Layer (TTL Idempotency Cache):** Incoming `POST /checkout` requests require an `idempotency_key`. The Node.js gateway caches active keys in an in-memory `Map` with a **15-minute Time-To-Live (TTL)** and a 60-second background eviction worker. Duplicate requests within the window are immediately short-circuited with `HTTP 409 Conflict`.
* **Core Engine Layer (Strict Finite State Machine):** Every transaction follows a strict one-way state transition graph (`INITIATED` $\rightarrow$ `PENDING` $\rightarrow$ `CAPTURED` | `FAILED`). Once a transaction reaches a terminal state (`CAPTURED` or `FAILED`), the C++ engine rejects any subsequent mutation attempt with `HTTP 409 Conflict`.

### 2. Cryptographic Webhook Verification (HMAC-SHA256)
* Asynchronous bank callbacks (`POST /webhook`) are untrusted external inputs.
* The API Gateway computes `HMAC-SHA256(raw_json_payload, WEBHOOK_SECRET)` and verifies it against the `x-webhook-signature` HTTP header before forwarding state updates to the C++ core. Tampered payloads or forged signatures are rejected with `HTTP 401 Unauthorized`.

### 3. Low-Latency Concurrency & Mutual Exclusion
* The C++ Core Engine manages an in-memory hash table (`std::unordered_map<string, TxnState>`) protected by OS-level `CRITICAL_SECTION` locks (`EnterCriticalSection` / `LeaveCriticalSection`), preventing race conditions when concurrent polling and webhook threads access the same transaction ID.

### 4. Write-Ahead Logging (WAL) & Crash Recovery
* Every state transition is synchronously appended to `ledger.log` with a Unix timestamp inside the critical section before releasing the lock.
* On startup, `recover_from_ledger()` sequentially replays `ledger.log` to reconstruct the exact in-memory transaction state map before binding port `8080`, providing durability across server restarts and crashes.

---

## API Reference

| Service | Method & Route | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| **API Gateway (`:3000`)** | `POST /checkout` | Initiates a UPI payment and locks state as `PENDING` in C++ Core. | `202 Accepted`, `400 Bad Request`, `409 Conflict` |
| **API Gateway (`:3000`)** | `POST /webhook` | Verifies `x-webhook-signature` HMAC and settles transaction state. | `200 OK`, `401 Unauthorized`, `409 Conflict` |
| **API Gateway (`:3000`)** | `GET /status/:txn_id` | Polls real-time transaction state from the C++ Core Engine. | `200 OK`, `404 Not Found` |
| **C++ Engine (`:8080`)** | `POST /internal/init` | Creates transaction entry, locks `PENDING`, appends to WAL. | `200 OK`, `400 Bad Request` |
| **C++ Engine (`:8080`)** | `POST /internal/update` | Enforces state machine transition (`PENDING` $\rightarrow$ `CAPTURED`/`FAILED`). | `200 OK`, `404 Not Found`, `409 Conflict` |
| **C++ Engine (`:8080`)** | `POST /internal/status` | Performs $O(1)$ thread-safe hash map lookup of transaction status. | `200 OK`, `404 Not Found` |

---

## Local Setup & Quickstart (Windows)

### 1. Configure Gateway Environment Variables
Create `gateway_node/.env` with your local configuration:
```env
PORT=3000
CPP_ENGINE_URL=[http://127.0.0.1:8080](http://127.0.0.1:8080)
WEBHOOK_SECRET=upi_super_secret_key_2026
UPI_API_KEY=sandbox_key_99887766
```

### 2. Compile & Start the C++ Core Engine (Port 8080)
```powershell
cd logic_cpp
g++ engine.cpp -o engine.exe -lws2_32
.\engine.exe
```

### 3. Start the Node.js API Gateway (Port 3000)
```powershell
cd gateway_node
npm install
node server.js
```

### 4. Start the Google Pay Checkout & NPCI Switch UI (Port 4000)
```powershell
cd web_node
node server.js
```
Open **`http://127.0.0.1:4000`** in your browser to initiate payments, inspect live telemetry, and trigger bank webhook settlements or security attacks.