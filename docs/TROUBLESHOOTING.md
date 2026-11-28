# DevPilot — Windows Troubleshooting & Operator Recovery Guide

This guide covers common environmental, runtime, database, storage, and AI engine issues encountered on Windows development environments, along with safe recovery procedures.

---

## 1. Database & PostgreSQL Issues

### 1.1 Connection Refused on PostgreSQL Port (5432 vs 5433)
- **Symptom:**  
  `Can't reach database server at localhost:5432` or `connect ECONNREFUSED 127.0.0.1:5432`
- **Cause:**  
  The local PostgreSQL Windows service is stopped, or PostgreSQL is listening on a non-default port (e.g. `5433` if installed alongside another PostgreSQL cluster or Docker).
- **Remediation:**
  1. Open PowerShell as Administrator and check the service status:
     ```powershell
     Get-Service -Name postgresql* | Select-Object Name, Status, StartType
     ```
  2. If stopped, start the service:
     ```powershell
     Start-Service postgresql*
     ```
  3. Determine the actual listening port using PowerShell:
     ```powershell
     Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5432, 5433, 5434 } | Select-Object LocalAddress, LocalPort, OwningProcess
     ```
  4. Update `.env` to match the active port:
     ```env
     DATABASE_URL="postgresql://postgres:postgres@localhost:5433/devpilot?schema=public"
     ```

### 1.2 Database "devpilot" Does Not Exist
- **Symptom:**  
  `database "devpilot" does not exist` when running `npm run db:migrate` or `npm run db:seed`.
- **Cause:**  
  PostgreSQL database was not created prior to running Prisma commands.
- **Remediation:**
  Create the database using `psql` or `createdb`:
  ```powershell
  psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE devpilot;"
  ```
  Then rerun:
  ```powershell
  npm run db:generate
  npm run db:migrate
  ```

### 1.3 Special Characters in PostgreSQL Password
- **Symptom:**  
  `Error: P1013: The provided database string is invalid.`
- **Cause:**  
  Passwords containing special characters (`@`, `:`, `#`, `%`, `&`, `/`) must be URL-encoded in `DATABASE_URL`.
- **Remediation:**  
  URL-encode the special character (e.g., replace `@` with `%40`, `#` with `%23`):
  ```env
  DATABASE_URL="postgresql://postgres:p%40ssword@localhost:5432/devpilot?schema=public"
  ```

### 1.4 PostgreSQL Command Not Recognized (psql, pg_dump, pg_restore)
- **Symptom:**  
  `psql : The term 'psql' is not recognized as the name of a cmdlet, function, script file, or operable program.`
- **Cause:**  
  The PostgreSQL Windows installer (EnterpriseDB) does not automatically add its `bin` directory to the system `PATH`.
- **Remediation:**  
  1. Add PostgreSQL's `bin` directory to your active PowerShell session:
     ```powershell
     $env:PATH += ";C:\Program Files\PostgreSQL\18\bin"
     ```
     *(Adjust `18` to your installed version, e.g. `16` or `14`)*
  2. To make it permanent, add the path to your Windows Environment Variables (`sysdm.cpl` > Advanced > Environment Variables).
  3. Alternatively, invoke using the full quoted path:
     ```powershell
     & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE devpilot;"
     ```

---

## 2. Environment & Toolchain Issues

### 2.1 PowerShell Script Execution Disabled
- **Symptom:**  
  `File ...\npm.ps1 cannot be loaded because running scripts is disabled on this system.`
- **Cause:**  
  Windows default PowerShell execution policy restricts script execution.
- **Remediation:**  
  Allow script execution for the current process without changing system-wide security policies:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```

### 2.2 Incompatible Node.js Version
- **Symptom:**  
  TypeScript typechecking errors in `@types/node` or runtime errors related to built-in modules (`node:test`, `node:assert/strict`).
- **Cause:**  
  Running Node.js version below `20.14.0`.
- **Remediation:**  
  Check active versions:
  ```powershell
  node -v
  npm -v
  ```
  Install Node.js version `20.14.0` or higher (verified stable on `v24.13.1`). If using NVM for Windows:
  ```powershell
  nvm install 24.13.1
  nvm use 24.13.1
  ```

### 2.3 Port Conflicts (Port 3000 or 4000 Already in Use)
- **Symptom:**  
  `listen EADDRINUSE: address already in use 0.0.0.0:4000` (API) or `port 3000 is already in use` (Web).
- **Cause:**  
  A previous Node.js process was not terminated cleanly.
- **Remediation:**
  Find the process ID (PID) locking the port:
  ```powershell
  Get-NetTCPConnection -LocalPort 4000, 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
  ```
  Terminate the orphaned process:
  ```powershell
  Stop-Process -Id <PID> -Force
  ```

---

## 3. Storage & Media Asset Issues

### 3.1 Broken Thumbnails or Missing Media in Browser
- **Symptom:**  
  Media Library shows broken image thumbnails, or requests to `/api/v1/media/:id/thumbnail` return HTTP `404 Not Found`.
- **Cause:**  
  `STORAGE_DIR` configuration mismatch, or physical image files in `storage/uploads/` were not restored during machine migration.
- **Remediation:**
  1. Confirm `STORAGE_DIR` in `.env` points to the canonical storage directory:
     ```env
     STORAGE_DIR="./storage"
     ```
  2. Verify that `storage/uploads` physically exists and contains the expected media files:
     ```powershell
     Get-ChildItem -Path "storage\uploads" | Measure-Object
     ```
  3. If migrating from another machine, extract the media archive following [docs/WINDOWS_MIGRATION.md](WINDOWS_MIGRATION.md).

### 3.2 Path Traversal & Security Rejection
- **Symptom:**  
  Upload or image retrieval rejected with `403 Forbidden` (`PATH_TRAVERSAL_DETECTED`).
- **Cause:**  
  DevPilot's media security module strictly validates that file paths resolve within the canonical storage directory.
- **Remediation:**  
  Never reference parent directories (`..`) or absolute external directories in database records. All media must reside under `<STORAGE_DIR>/uploads`.

---

## 4. Local AI (Ollama) & Engine Recovery Lifecycle

DevPilot enforces a strict **fail-closed, single-process AI policy** to protect Windows systems from runaway CPU/GPU inference.

### 4.1 Ollama Service Unavailable
- **Symptom:**  
  `GET /api/v1/ai/status` returns status `OLLAMA_DISCONNECTED`. Generation attempts return HTTP `503 Service Unavailable (code: "AI_OLLAMA_UNAVAILABLE")`.
- **Cause:**  
  Ollama is not running on `127.0.0.1:11434`.
- **Remediation:**
  1. Verify Ollama is running in Windows:
     ```powershell
     curl http://127.0.0.1:11434/api/tags
     ```
  2. If not running, start Ollama from the Windows Start menu or run:
     ```powershell
     ollama serve
     ```

### 4.2 Required Model Not Found
- **Symptom:**  
  `OLLAMA_MODEL_NOT_FOUND: Model 'qwen2.5:3b' is not pulled in local Ollama.`
- **Cause:**  
  The required model `qwen2.5:3b` has not been downloaded to the local Ollama library.
- **Remediation:**  
  Pull the model explicitly:
  ```powershell
  ollama pull qwen2.5:3b
  ```
  Verify with:
  ```powershell
  ollama list
  ```

### 4.3 Stale PID Lock (`storage/ai-engine.pid`)
- **Symptom:**  
  API server refuses to initialize AI routes or rejects generation calls with HTTP `503 Service Unavailable (code: "AI_ENGINE_OWNED_BY_ANOTHER_PROCESS")`.
- **Cause:**  
  A previous API instance terminated abruptly (e.g. system power outage, Task Manager force kill), leaving its PID lock on disk.
- **Safe Operator Recovery Procedure:**
  1. Open PowerShell and verify that **no other DevPilot API process is currently running**:
     ```powershell
     Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path
     ```
  2. Verify that the port `4000` is free:
     ```powershell
     Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
     ```
  3. Only after confirming that no other API process is active, delete the stale lock file:
     ```powershell
     Remove-Item -Force "storage\ai-engine.pid"
     ```
  4. Restart the API server (`npm run dev -w apps/api`).

### 4.4 Engine Status: `RECOVERY_REQUIRED`
- **Symptom:**  
  All AI generation endpoints reject requests with HTTP `503 Service Unavailable (code: "AI_RECOVERY_REQUIRED")`.
- **Root Cause & Safety Behavior:**  
  When an AI inference request exceeds `OLLAMA_TIMEOUT_MS` (default 120s) or aborts mid-flight, Node aborts the socket connection. However, Ollama's internal CPU thread pool may continue crunching the interrupted job. To prevent runaway concurrency and CPU starvation, DevPilot intentionally locks the engine into `RECOVERY_REQUIRED` by preserving `storage/ai-recovery.lock`.
- **Standard Audited Recovery (Recommended):**  
  An authenticated `OWNER` or `ADMIN` must execute the audited reset endpoint via HTTP:
  ```bash
  curl -X POST http://localhost:4000/api/v1/ai/engine/reset \
    -H "Content-Type: application/json" \
    -H "Cookie: devpilot_token=<YOUR_JWT_TOKEN>" \
    -d '{
      "idempotencyKey": "b2c6d4e1-88f5-4e2a-9e12-3456789abcde",
      "confirmed": true,
      "recoveryCondition": "INFERENCE_SETTLED",
      "operatorNotes": "Checked Task Manager: Ollama CPU usage is 0%."
    }'
  ```
  *Expected Response (HTTP 200):*
  ```json
  {
    "success": true,
    "data": {
      "message": "AI engine successfully reset to IDLE",
      "engineStatus": "IDLE"
    }
  }
  ```
- **Disaster Recovery (When Server Cannot Boot):**  
  If the server crashed during inference and refuses to start:
  1. Open Task Manager and confirm Ollama CPU usage has dropped to 0%.
  2. Remove the recovery lock file manually:
     ```powershell
     Remove-Item -Force "storage\ai-recovery.lock"
     ```
  3. Restart the server.

---

## 5. Windows Firewall & Network Connectivity

### 5.1 Localhost Loopback Blocking
- **Symptom:**  
  Frontend cannot reach backend at `http://localhost:4000`, or API cannot reach Ollama at `http://127.0.0.1:11434`.
- **Cause:**  
  Third-party Windows security software or VPN client intercepting loopback traffic.
- **Remediation:**  
  1. Ensure both `.env` and client configurations use `127.0.0.1` or `localhost`.
  2. Temporarily disable VPN split-tunneling if local loopback traffic is routed through a remote gateway.
  3. Verify loopback connectivity:
     ```powershell
     Test-NetConnection -ComputerName 127.0.0.1 -Port 4000
     Test-NetConnection -ComputerName 127.0.0.1 -Port 11434
     ```
