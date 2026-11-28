# DevPilot — Windows Migration Runbook (Office PC → Home PC)

This runbook provides an end-to-end, zero-data-loss guide for migrating a working DevPilot instance from one Windows machine (e.g., Office PC) to another (e.g., Home PC) without modifying application code or database schema.

---

## 1. Architectural Migration Overview

DevPilot's persistent state consists of three distinct components:
1. **Relational Database (PostgreSQL):** Stores accounts, brand guidelines, content posts, schedules, approvals, audit logs, and generation history.
2. **Canonical Media Storage (`<STORAGE_DIR>/uploads`):** Physical media files (JPEG, PNG, WebP, GIF) referenced by relative paths in the `media_assets` database table.
3. **Local AI Model (Ollama):** The `qwen2.5:3b` Small Language Model (SLM) running on the local Ollama instance (`127.0.0.1:11434`).

> [!IMPORTANT]
> **The Database Dump and Media Archive Are an Inseparable Pair**  
> Restoring a PostgreSQL database dump without its accompanying physical media archive leaves `media_assets` database records pointing to non-existent disk files, leading to broken images, failed thumbnail streaming, and invalid post attachments. Both must be migrated together.

> [!CAUTION]
> **Never Transfer Machine-Specific Runtime Lock Files**  
> Never copy `storage/ai-engine.pid`, `storage/ai-recovery.lock`, or `storage/temp/` between machines. Transferring runtime locks causes the destination API server to detect a foreign PID or assume a crashed inference job, locking the AI engine into `RECOVERY_REQUIRED` on startup.

---

## 2. Phase 1: Source Machine (Office PC) Backup

Perform these steps on the source Windows PC before transferring data.

### Step 1.1: Graceful Service Shutdown
Ensure all database writes have settled by stopping the active development processes:
- In the Fastify API terminal: Press `Ctrl + C` and wait for process termination.
- In the Next.js Web terminal: Press `Ctrl + C` and wait for process termination.

Verify via PowerShell that no orphaned Node processes are running:
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path
```

### Step 1.2: Git State Synchronization
Inspect Git status to ensure all source code modifications are accounted for:
```powershell
git status --short
git rev-parse HEAD
```

If you have uncommitted changes on the source machine that you want to transfer:
- **Option A (Committed):** Commit changes to your feature branch and push to your remote Git repository:
  ```powershell
  git commit -m "feat/chore: sync work prior to machine migration"
  git push origin master
  ```
- **Option B (Uncommitted Working Tree Archive):** If changes must remain uncommitted, export a Git patch or archive the working directory directly (excluding `node_modules` and `.next`):
  ```powershell
  git diff HEAD > devpilot_uncommitted.patch
  ```

### Step 1.3: PostgreSQL Database Backup
Export the `devpilot` database using PostgreSQL's custom binary archive format (`-Fc`). This format includes compression, table schemas, and relational data:

In PowerShell (adjust `-p <port>` to your source machine's PostgreSQL port, e.g. `5432` or `5433`):
```powershell
# Create backup directory
New-Item -ItemType Directory -Force -Path "C:\DevPilot_Backup"

# Dump database in compressed custom archive format
pg_dump -U postgres -h localhost -p 5433 -d devpilot -Fc -f "C:\DevPilot_Backup\devpilot_backup.dump"
```
*(Optional plain-text SQL export for inspection):*
```powershell
pg_dump -U postgres -h localhost -p 5433 -d devpilot -Fp -f "C:\DevPilot_Backup\devpilot_backup.sql"
```

### Step 1.4: Media Assets Archive
Archive **only** the `uploads` directory under canonical storage. Do **not** archive the parent `storage/` directory directly:

```powershell
# Verify canonical uploads exist
Get-ChildItem -Path "storage\uploads"

# Compress uploads folder into the backup directory
Compress-Archive -Path "storage\uploads\*" -DestinationPath "C:\DevPilot_Backup\devpilot_media_uploads.zip" -Force
```

### Step 1.5: Verify Backup Payload
Ensure your transfer payload contains:
1. `devpilot_backup.dump` (PostgreSQL binary archive)
2. `devpilot_media_uploads.zip` (Physical image files)
3. Source Git commit hash (record `git rev-parse HEAD`)

---

## 3. Phase 2: Transfer to Destination Machine (Home PC)

Transfer `C:\DevPilot_Backup` to the destination PC using a secure transfer method (e.g., encrypted USB drive, private cloud drive, or secure network copy). Place files at `C:\DevPilot_Backup\`.

---

## 4. Phase 3: Destination Machine (Home PC) Restore

Perform these steps on the destination Windows PC.

### Step 3.1: Prerequisites Verification
Ensure the following tools are installed and available in PowerShell:
- **Node.js**: Minimum `20.14.0` (verified on `v24.13.1`). Check with `node -v`.
- **npm**: Minimum `10.0.0` (verified on `v11.2.0`). Check with `npm -v`.
- **Git for Windows**: Check with `git --version`.
- **PostgreSQL**: Version 14+ (tested on PostgreSQL 18). Ensure `psql` and `pg_restore` are in `PATH`.
- **Ollama for Windows**: Download and install from [ollama.com/download/windows](https://ollama.com/download/windows).

### Step 3.2: Clone Repository and Checkout Baseline
Clone the repository (or synchronize your working tree) to the desired destination directory:
```powershell
git clone <repository-url> C:\Rachit\DevPilot
cd C:\Rachit\DevPilot
git checkout master
```
*(If applying an uncommitted patch from Step 1.2):*
```powershell
git apply C:\DevPilot_Backup\devpilot_uncommitted.patch
```

### Step 3.3: Install Dependencies & Generate Prisma Client
Install monorepo dependencies and generate the Prisma Client:
```powershell
# Install all workspace dependencies
npm install

# Generate Prisma Client for the current platform
npm run db:generate
```

### Step 3.4: Configure Destination `.env`
Create a fresh `.env` by copying `.env.example`:
```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor and configure it for the Home PC:
1. **`DATABASE_URL`**: Update with your Home PC's PostgreSQL port (commonly standard `5432`):
   ```env
   DATABASE_URL="postgresql://postgres:YourHomePassword@localhost:5432/devpilot?schema=public"
   ```
2. **`PORT`**, **`API_URL`**, **`WEB_URL`**: Keep standard development ports:
   ```env
   PORT=4000
   API_URL="http://localhost:4000"
   WEB_URL="http://localhost:3000"
   ```
3. **Secrets (`JWT_SECRET`, `COOKIE_SECRET`)**: Keep or configure strong random strings (minimum 32 characters).
4. **Storage (`STORAGE_DIR`)**:
   ```env
   STORAGE_DIR="./storage"
   ```

### Step 3.5: Create Destination Database
Ensure the `devpilot` database exists in the destination PostgreSQL instance:
```powershell
# Create database using psql (adjust -p to your Home PC's PostgreSQL port, e.g. 5432)
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE devpilot;"
```

> [!WARNING]
> **Do NOT Run `npm run db:migrate` or `prisma migrate reset` at This Stage**  
> Running `db:migrate` creates an empty schema with initial seed requirements, whereas `pg_restore` will restore the exact production schema and data. Running `migrate reset` will permanently destroy restored data.

### Step 3.6: Restore PostgreSQL Database
Restore the custom binary backup into the newly created database:
```powershell
pg_restore -U postgres -h localhost -p 5432 -d devpilot --clean --if-exists -v "C:\DevPilot_Backup\devpilot_backup.dump"
```
*(Note: Minor notices regarding ownership of public schemas can be safely ignored if connecting as the default `postgres` superuser).*

### Step 3.7: Restore Physical Media Files
Recreate the canonical uploads directory structure and unpack the media archive:
```powershell
# Ensure canonical storage and uploads directories exist
New-Item -ItemType Directory -Force -Path "storage\uploads"
New-Item -ItemType Directory -Force -Path "storage\temp"

# Extract media files into storage\uploads
Expand-Archive -Path "C:\DevPilot_Backup\devpilot_media_uploads.zip" -DestinationPath "storage\uploads" -Force

# Verify extracted media files
Get-ChildItem -Path "storage\uploads" | Measure-Object | Select-Object Count
```

### Step 3.8: Prepare Local AI Model (Ollama)
1. Ensure Ollama is running in the Windows system tray or run:
   ```powershell
   ollama serve
   ```
2. Download the required model:
   ```powershell
   ollama pull qwen2.5:3b
   ```
3. Confirm model availability:
   ```powershell
   ollama list
   ```

---

## 5. Phase 4: Data Integrity & Functional Verification

Run these verification checks before using DevPilot on the destination PC.

### Step 4.1: Database Row Count Validation
Run this SQL query against your restored database to verify record counts across core tables:

```powershell
psql -U postgres -h localhost -p 5432 -d devpilot -c '
SELECT "table_name", "count" FROM (
  SELECT "users" AS "table_name", COUNT(*) AS "count" FROM "users"
  UNION ALL
  SELECT "brand_settings", COUNT(*) FROM "brand_settings"
  UNION ALL
  SELECT "application_settings", COUNT(*) FROM "application_settings"
  UNION ALL
  SELECT "content_posts", COUNT(*) FROM "content_posts"
  UNION ALL
  SELECT "media_assets", COUNT(*) FROM "media_assets"
  UNION ALL
  SELECT "content_schedules", COUNT(*) FROM "content_schedules"
  UNION ALL
  SELECT "approvals", COUNT(*) FROM "approvals"
  UNION ALL
  SELECT "activity_logs", COUNT(*) FROM "activity_logs"
  UNION ALL
  SELECT "generation_histories", COUNT(*) FROM "generation_histories"
) summary ORDER BY "table_name";
'
```

### Step 4.2: Media File Linkage Audit
Verify that every `media_assets` database record has a corresponding file on disk using this PowerShell here-string:

```powershell
@'
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function checkMedia() {
  const assets = await prisma.mediaAsset.findMany();
  console.log('Total database media records:', assets.length);
  
  let missing = 0;
  for (const asset of assets) {
    const fullPath = path.resolve(asset.filePath);
    if (!fs.existsSync(fullPath)) {
      console.error('MISSING FILE:', asset.filePath, '(Original: ' + asset.originalName + ')');
      missing++;
    }
  }
  
  if (missing === 0) {
    console.log('✅ All ' + assets.length + ' media files physically exist in storage/uploads!');
  } else {
    console.error('❌ ' + missing + ' media files are missing on disk!');
  }
  await prisma.$disconnect();
}

checkMedia();
'@ | node
```

### Step 4.3: Service Startup & Health Check
Open two separate PowerShell terminals to start the services:

- **Terminal 1 (Backend API):**
  ```powershell
  npm run dev -w apps/api
  ```
  *Expected Output:* `[Fastify] Server listening at http://0.0.0.0:4000`

- **Terminal 2 (Frontend Web):**
  ```powershell
  npm run dev -w apps/web
  ```
  *Expected Output:* `▲ Next.js 16.4.6 (Turbopack) Ready in ... http://localhost:3000`

### Step 4.4: Functional Browser Verification
1. Navigate to `http://localhost:3000/login`.
2. Log in using your existing owner account credentials migrated from the Office PC.
3. Check the **Dashboard** (`/`): Verify metrics, upcoming schedules, and recent audit trails display migrated data.
4. Check the **Media Library** (`/media`): Verify all thumbnails render without broken image icons.
5. Check the **AI Studio** (`/studio`): Verify AI status indicator reports `OLLAMA_CONNECTED` and test generating a caption or hook.

---

## 6. Migration Rollback Strategy

If database restoration fails or corrupted data is detected:
1. Stop API and Web servers.
2. Drop the corrupted destination database:
   ```powershell
   psql -U postgres -h localhost -p <port> -c "DROP DATABASE devpilot;"
   ```
3. Remove incomplete media files:
   ```powershell
   Remove-Item -Recurse -Force "storage\uploads\*"
   ```
4. Recreate database and restore from `devpilot_backup.dump` following Section 4.
5. If the backup file itself is unreadable, re-export from the Office PC following Section 2.
