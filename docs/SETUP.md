# DevPilot — Local Environment Setup & Configuration

## 1. Prerequisites
- **Node.js**: v18+ (tested on v24)
- **npm**: v9+ (tested on v11)
- **PostgreSQL**: v14+ running locally (default standard port is 5432; local dev instances may run on 5433 or custom ports as configured in your `.env`)

---

## 2. Environment Variables Setup
Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Update the `DATABASE_URL` with your local PostgreSQL credentials and actual port:
```env
# Follow your active PostgreSQL port (e.g. 5432 default, or 5433 if running on a custom port/Docker mapping)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/devpilot?schema=public"
JWT_SECRET="generate-a-strong-secret-key-for-devpilot-local-sessions"
PORT=4000
API_URL="http://localhost:4000"
WEB_URL="http://localhost:3000"
INITIAL_OWNER_EMAIL="admin@codeculture.dev"
INITIAL_OWNER_PASSWORD="ChangeMeInLocalDev123!"

# Local Storage Directory (relative to project root)
STORAGE_DIR="./storage"
UPLOAD_DIR="./storage/uploads"

# Local AI / Ollama Service Configuration
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen2.5:3b"
OLLAMA_TIMEOUT_MS=120000
```

> **Note on PostgreSQL Port Configuration**: Developers must follow their own active PostgreSQL connection settings in `DATABASE_URL` rather than changing the host port. If your local PostgreSQL listens on 5432, set `localhost:5432`; if running on 5433, set `localhost:5433`.

---

## 3. Database Migration & Seeding
Once PostgreSQL is running:

```bash
# Generate Prisma Client
npm run db:generate

# Run initial migration
npm run db:migrate

# Seed default CodeCulture brand settings and initial Owner user
npm run db:seed
```

---

## 4. Development Workflow
Run all workspace services:
```bash
npm run dev
```
- Web Application: `http://localhost:3000`
- API Server: `http://localhost:4000`

---

## 5. Local AI Infrastructure (Ollama) & Backend Engine (Milestone 2.2.1)

DevPilot utilizes **Ollama** for zero-cost, local AI text generation, ideation, and assistance without external cloud dependencies.

### 5.1 Windows Installation & Prerequisites
1. Download the official installer from [ollama.com/download/windows](https://ollama.com/download/windows).
2. Execute `OllamaSetup.exe` and complete the installation.
3. Ollama runs as a background process listening on `http://127.0.0.1:11434`.

### 5.2 Model Download
Pull the single verified model for DevPilot CPU inference:
```bash
ollama pull qwen2.5:3b
```
Verify installed models:
```bash
ollama list
```

### 5.3 Single-Process Restriction & Cooperative PID Lock
DevPilot enforces a strict **single-process API deployment policy** for local AI generation.
- The API acquires an atomic cooperative lock at `storage/ai-engine.pid`.
- A second running API process will refuse to initialize local AI generation and will reject generation calls with HTTP `503 Service Unavailable (code: "AI_ENGINE_OWNED_BY_ANOTHER_PROCESS")`.
- **Operator Recovery on Crash**: If the API server experiences an unclean termination (e.g. power cut, task manager kill), the PID lock file may remain on disk. To resume AI operations on reboot, an operator must verify in Task Manager that no previous DevPilot process is running, and manually delete `storage/ai-engine.pid`.

### 5.4 Pre-Inference Recovery Marker & Safe Timeout Lifecycle
- Before dispatching any prompt to Ollama, DevPilot flushes an atomic recovery marker to `storage/ai-recovery.lock`.
- On clean completion, the marker is deleted and the engine returns to `IDLE`.
- On CPU timeout (default 120s) or socket abort:
  - The marker is intentionally preserved on disk.
  - The engine transitions to `RECOVERY_REQUIRED`.
  - All subsequent generation requests are blocked with HTTP `503 Service Unavailable (code: "AI_RECOVERY_REQUIRED")`.
- **Known Platform Limitation**: Aborting Node's HTTP connection via `AbortController` does **NOT** guarantee immediate inference cessation inside Ollama's internal CPU thread pool. The `RECOVERY_REQUIRED` lock ensures that DevPilot will never dispatch new inference tasks while prior inference may still be consuming CPU.

### 5.5 Audited Engine Recovery & Reset (`POST /api/v1/ai/engine/reset`)
To restore an engine in `RECOVERY_REQUIRED` to `IDLE`, an authenticated `OWNER` or `ADMIN` must execute an explicit reset operation:
- **Endpoint**: `POST /api/v1/ai/engine/reset`
- **Headers**: Authorization Cookie or Bearer JWT.
- **Request Body**:
  ```json
  {
    "idempotencyKey": "a-valid-uuid-v4",
    "confirmed": true,
    "recoveryCondition": "INFERENCE_SETTLED", // or "OLLAMA_STOPPED"
    "operatorNotes": "Verified via Task Manager that local CPU inference is idle."
  }
  ```
- **Lifecycle & Invariants**:
  1. Writes `AI_ENGINE_RESET_ATTEMPTED` (sequence: 1).
  2. Validates recovery condition (`INFERENCE_SETTLED` pings Ollama; `OLLAMA_STOPPED` bypasses ping).
  3. Writes `AI_ENGINE_RESET_AUTHORIZED` (sequence: 2).
  4. Deletes recovery marker files on disk.
  5. Writes `AI_ENGINE_RESET_COMPLETED` (sequence: 3).
  6. Returns engine to `IDLE`.
- Resuming an interrupted reset strictly requires the **same `idempotencyKey`**. Competing keys are blocked with HTTP `409 Conflict`.

### 5.6 Anti-Fabrication Safeguards & Mandatory Human Review
Prompts inject strict anti-fabrication constraints prohibiting hallucinated statistics, percentages, benchmarks, customer numbers, and testimonials. An automated regex heuristic flags unsourced percentage/metric claims and triggers at most 1 bounded repair cycle before rejection (HTTP `502 Bad Gateway`).
- **Limitation**: LLMs cannot provide mathematical guarantees of semantic factual accuracy. All AI-generated content is generated strictly as unapproved draft copy and requires human review.

### 5.7 Generation Endpoints & Role Permissions
Rate Limit: 10 requests/minute per authenticated user.

| Endpoint | Permitted Roles | Output |
|---|---|---|
| `POST /api/v1/ai/generate/ideas` | `OWNER`, `ADMIN`, `EDITOR`, `APPROVER` | Exactly 3 concepts |
| `POST /api/v1/ai/generate/caption` | `OWNER`, `ADMIN`, `EDITOR`, `APPROVER` | 1 structured caption with hook, body, CTA, hashtags |
| `POST /api/v1/ai/generate/hooks` | `OWNER`, `ADMIN`, `EDITOR`, `APPROVER` | Exactly 5 hooks |
| `POST /api/v1/ai/generate/hashtags` | `OWNER`, `ADMIN`, `EDITOR`, `APPROVER` | 10–25 hashtags |
| `POST /api/v1/ai/generate/cta` | `OWNER`, `ADMIN`, `EDITOR`, `APPROVER` | Exactly 3 CTAs |
| `POST /api/v1/ai/generate/rewrite` | `OWNER`, `ADMIN`, `EDITOR`, `APPROVER` | 1 rewritten text |
| `GET /api/v1/ai/status` | All authenticated users | Engine status & model info |
| `POST /api/v1/ai/engine/reset` | `OWNER`, `ADMIN` only | Operator recovery |
