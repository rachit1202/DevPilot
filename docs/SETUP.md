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

## 7. Local AI Infrastructure (Ollama) Setup (Milestone 2.1+)

DevPilot utilizes **Ollama** for zero-cost, local AI text generation, ideation, and assistance without external cloud dependencies.

### 7.1 Windows Installation
1. Download the official installer from [ollama.com/download/windows](https://ollama.com/download/windows).
2. Execute `OllamaSetup.exe` and complete the installation.
3. Ollama runs as a background process listening on `http://127.0.0.1:11434`.

### 7.2 Service Verification
Verify that the local Ollama daemon is running:
```bash
curl http://127.0.0.1:11434/
# Output: Ollama is running
```

### 7.3 Model Download
Pull the candidate models verified for DevPilot CPU inference:
```bash
# Primary Candidate (3B parameters)
ollama pull qwen2.5:3b

# Fallback Candidate (1.5B parameters)
ollama pull qwen2.5:1.5b
```

Verify installed models:
```bash
ollama list
```

### 7.4 Model Licensing Review Note
- **Qwen 2.5 1.5B & 3B** are released under their respective open-weights license agreements. Note that the 3B model has specific terms regarding commercial distribution thresholds and research attribution. Developers and organizations deploying DevPilot for commercial purposes must review the official Qwen 2.5 license terms before distribution.

### 7.5 Target Hardware Performance Benchmarking
Because CPU inference performance varies across host systems (e.g., thermal limits, AVX2 utilization, RAM clock speeds), actual inference throughput should be benchmarked on your specific hardware:
```bash
ollama run qwen2.5:3b --verbose "Generate 3 social media hooks for web developers."
```
Check the reported `eval rate` (in tokens/second) in the verbose output to verify sustainable generation speed on your CPU.

### 7.6 Troubleshooting Ollama Unavailable
If `GET /api/v1/ai/status` returns `available: false`:
1. Ensure Ollama is active in the Windows system tray.
2. Confirm port 11434 is listening:
   ```powershell
   Get-NetTCPConnection -LocalPort 11434 -ErrorAction SilentlyContinue
   ```
3. Check `OLLAMA_BASE_URL` in your `.env` file (defaults to `http://127.0.0.1:11434`).
4. If a model is reported missing in `/api/v1/ai/status`, run `ollama pull <model-name>`.

