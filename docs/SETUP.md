# DevPilot — Local Environment Setup & Windows Configuration Guide

This guide provides step-by-step instructions for installing and running DevPilot on a fresh Windows 10/11 workstation.

---

## 1. Prerequisites & Toolchain Requirements

Ensure the following tools are installed and accessible from PowerShell:

| Prerequisite | Minimum Required Version | Verified Operational Baseline | Installation / Check |
| :--- | :--- | :--- | :--- |
| **Node.js** | **`20.14.0`** *(compatibility baseline)* | `v24.13.1` (64-bit) | `node -v` |
| **npm** | **`10.0.0`** | `v11.2.0` | `npm -v` |
| **Git for Windows** | `2.30.0+` | `2.47.0+` | `git --version` |
| **PostgreSQL** | `14+` | `18.0` (64-bit) | `psql --version` |
| **Ollama for Windows** | `0.3.0+` | Latest official Windows release | `ollama --version` |

> [!IMPORTANT]
> **Node.js Compatibility Baseline:**  
> DevPilot establishes Node.js **`20.14.0`** as its project compatibility baseline derived from existing toolchain and dependency requirements (including `@types/node: ^20.14.0` and modern runtime APIs). Node.js `v24.13.1` is documented as the verified development environment. Do not attempt to run DevPilot on older releases such as Node.js 18.x.

> [!TIP]
> **PostgreSQL Executable Availability (Windows PATH):**  
> On Windows, the standard PostgreSQL installer (EnterpriseDB) does not always add its `bin` directory to the system `PATH` automatically.  
> 1. Verify if `psql`, `pg_dump`, and `pg_restore` are accessible from PowerShell:
>    ```powershell
>    psql --version; pg_dump --version; pg_restore --version
>    ```
> 2. If PowerShell returns `CommandNotFoundException`, locate your installed PostgreSQL `bin` directory (commonly `C:\Program Files\PostgreSQL\<version>\bin`, e.g. `18`, `16`, or `14`) and add it to your current PowerShell session:
>    ```powershell
>    $env:PATH += ";C:\Program Files\PostgreSQL\18\bin"
>    ```
>    To persist this across sessions, add the directory to your Windows User or System Environment Variables (`sysdm.cpl` > Advanced > Environment Variables).  
> 3. Alternatively, invoke the executable directly using its full quoted path, e.g.:
>    ```powershell
>    & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE devpilot;"
>    ```

---

## 2. Step-by-Step Fresh Installation

Follow these steps in an ordinary PowerShell terminal.

### Step 2.1: Clone Repository and Checkout Master
```powershell
git clone <repository-url> C:\Rachit\DevPilot
cd C:\Rachit\DevPilot
git checkout master
```

### Step 2.2: Install Monorepo Dependencies
Install all workspace dependencies across the monorepo:
```powershell
npm install
```

### Step 2.3: Configure Environment Variables (`.env`)
Copy the provided `.env.example` template to `.env` in the repository root:
```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor and configure your local settings:

```env
# ==============================================================================
# Database Configuration
# ==============================================================================
# Adjust user, password, and port to match your local PostgreSQL service.
# Default standard port is 5432; adjust to 5433 or custom port if applicable.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/devpilot?schema=public"

# ==============================================================================
# Server & Network Configuration
# ==============================================================================
PORT=4000
NODE_ENV=development
API_URL="http://localhost:4000"
WEB_URL="http://localhost:3000"
APP_TIMEZONE="Asia/Kolkata"

# ==============================================================================
# Rate Limiting Configuration
# ==============================================================================
AUTH_RATE_LIMIT_MAX=10
RATE_LIMIT_MAX=120

# ==============================================================================
# Authentication Secrets (minimum 32 characters each)
# ==============================================================================
JWT_SECRET="devpilot-local-jwt-super-secret-key-change-in-production-min32chars"
COOKIE_SECRET="devpilot-local-cookie-secret-key-min32chars"

# ==============================================================================
# Canonical Storage Configuration
# ==============================================================================
STORAGE_DIR="./storage"
UPLOAD_DIR="./storage/uploads"

# ==============================================================================
# Local AI (Ollama) Service Configuration
# ==============================================================================
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen2.5:3b"
OLLAMA_TIMEOUT_MS=120000

# ==============================================================================
# Initial Bootstrap Credentials (used exclusively by prisma/seed.ts)
# ==============================================================================
INITIAL_OWNER_NAME="CodeCulture Admin"
INITIAL_OWNER_EMAIL="admin@codeculture.dev"
INITIAL_OWNER_PASSWORD="ChangeMeInLocalDev123!"
```

#### Canonical Storage Root Architecture
- **`STORAGE_DIR`** is the single authoritative root for DevPilot local storage.
- Media uploads are stored in `<STORAGE_DIR>/uploads`.
- Runtime locks (`storage/ai-engine.pid`, `storage/ai-recovery.lock`) reside directly inside `STORAGE_DIR`.
- `UPLOAD_DIR` is retained solely for backward-compatible schema parsing and must **never** be treated as an independent root.

### Step 2.4: Create PostgreSQL Database
Before applying Prisma schema migrations, the PostgreSQL database must be created:
```powershell
# Create empty database using psql (adjust -p to your PostgreSQL port, e.g. 5432 or 5433)
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE devpilot;"
```

### Step 2.5: Generate Prisma Client & Run Migrations
Run Prisma generation and apply all 7 active migrations:
```powershell
# Generate Prisma Client (v5.22.0)
npm run db:generate

# Apply migrations to local PostgreSQL database
npm run db:migrate
```

### Step 2.6: Seed Initial Brand & Owner Account
Seed the initial CodeCulture brand identity and administrative Owner user:
```powershell
npm run db:seed
```
*Expected Output:*
```text
Seeding DevPilot database...
Created default brand settings: CodeCulture (...)
Created initial Owner user: admin@codeculture.dev (...)
Database seed completed successfully.
```

> [!NOTE]
> `prisma/seed.ts` is fully idempotent. If the brand settings or owner account already exist, it reuses them safely without duplicate errors.

### Step 2.7: Install Ollama & Download SLM Model
DevPilot utilizes local Ollama CPU/GPU inference for AI text, carousel, and reel generation.

1. Download and install Ollama from [ollama.com/download/windows](https://ollama.com/download/windows).
2. Ensure the Ollama background service is running (visible in the Windows system tray) or start it:
   ```powershell
   ollama serve
   ```
3. Pull the required Small Language Model:
   ```powershell
   ollama pull qwen2.5:3b
   ```
4. Verify the installed model:
   ```powershell
   ollama list
   ```

> [!IMPORTANT]
> **No Automatic Model Download or Fallback:**  
> DevPilot will **not** attempt to download models automatically over the internet at runtime, nor will it silently fall back to an unverified model. The `qwen2.5:3b` model must be pulled explicitly.

---

## 3. Starting the Development Application

Because DevPilot is structured as an npm monorepo with separate Fastify API and Next.js frontend workspaces, start the two services in **separate PowerShell terminal windows**:

### Terminal 1: Fastify Backend API
```powershell
cd C:\Rachit\DevPilot
npm run dev -w apps/api
```
*Expected Output:*
```text
[Fastify] Server listening at http://0.0.0.0:4000
```

### Terminal 2: Next.js Frontend Web
```powershell
cd C:\Rachit\DevPilot
npm run dev -w apps/web
```
*Expected Output:*
```text
▲ Next.js 16.4.6 (Turbopack)
- Local:        http://localhost:3000
- Environments: .env
✓ Starting...
✓ Ready in 1200ms
```

---

## 4. Verification & Health Checks

Verify your setup with these simple checks:

1. **API Health Endpoint:**
   ```powershell
   curl http://localhost:4000/api/v1/health
   ```
   *Expected Response:* `{"success":true,"data":{"status":"ok","service":"devpilot-api",...}}`

2. **AI Engine Status Endpoint:**
   ```powershell
   curl http://localhost:4000/api/v1/ai/status
   ```
   *Expected Response:* `{"success":true,"data":{"engineStatus":"IDLE","ollamaStatus":"CONNECTED","model":"qwen2.5:3b",...}}`

3. **Web Application & Login:**
   - Open your browser to `http://localhost:3000/login`.
   - Log in using your seeded Owner credentials:
     - **Email:** `admin@codeculture.dev` (or your configured `INITIAL_OWNER_EMAIL`)
     - **Password:** `ChangeMeInLocalDev123!` (or your configured `INITIAL_OWNER_PASSWORD`)
   - Confirm you are redirected to the **Command Center Dashboard** (`/`).

---

## 5. Additional Guides

- **Migrating to another Windows PC?** Follow the comprehensive [Office PC → Home PC Migration Runbook](WINDOWS_MIGRATION.md).
- **Encountered an issue?** Consult the [Windows Troubleshooting & Recovery Guide](TROUBLESHOOTING.md).
