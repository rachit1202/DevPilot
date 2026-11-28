# DevPilot

**Product Tagline:** Your AI-powered social media command center.  
**Initial Brand:** CodeCulture ("Code. Create. Build. Repeat.")

---

## Architecture Overview

DevPilot is a modular, local-first social media management command center built with modern TypeScript and isolated services:

- **Frontend (`apps/web`):** Next.js 16.4.6 (Turbopack, App Router), React 19, TypeScript, Tailwind CSS, Lucide icons, and accessible UI primitives.
- **Backend (`apps/api`):** Fastify 4.27, Node.js (v20.14.0+ baseline, verified on v24.13.1), TypeScript, REST API (`/api/v1`), Zod validation, and secure cookie sessions.
- **Database (`prisma/`):** PostgreSQL (14+, tested on v18.0) + Prisma ORM 5.22.0 with UUID primary keys and strict relational integrity.
- **Shared Packages (`packages/`):**
  - `@devpilot/shared`: Domain types, enums, DTOs, and DST-safe date utilities (`ianaLocalToUtc`, `utcToIanaLocal`).
  - `@devpilot/validation`: Zod validation schemas shared between frontend and backend.
- **Local Storage (`storage/`):** Single canonical storage root (`STORAGE_DIR`) for media assets (`uploads/`) with binary magic-byte anti-spoofing verification and runtime lock management.
- **Local AI Studio (Ollama):** Zero-cloud-cost inference using the local Small Language Model (SLM) `qwen2.5:3b` over loopback HTTP (`127.0.0.1:11434`).

---

## Phase 1 & Phase 2 Capabilities

DevPilot provides a production-grade, self-hosted administrative and content creation command center:

### 1. Authentication & RBAC (Phase 1)
- Stateless JWT tokens stored in `HttpOnly`, `SameSite=Lax` cookies.
- 5-tier role-based access control: `OWNER`, `ADMIN`, `APPROVER`, `EDITOR`, `ANALYST`.
- CSRF Origin/Referer verification and anti-timing login mitigation.

### 2. Brand & Application Settings (Phase 1)
- Configurable CodeCulture brand identity (tagline, voice guidelines, pillars, hashtags, colors).
- Authoritative dynamic IANA timezone management (`ApplicationSettings.timezone`).

### 3. Content & Media Libraries (Phase 1)
- Full post lifecycle management (Draft, In Review, Approved, Scheduled, Published, Rejected, Archived).
- Multi-criteria filtering by Status, Content Type, Category, and keyword search with pagination.
- Dedicated Inspect/View, Edit, Duplicate, Archive/Restore, and Delete workflows.
- Secure image uploads (JPEG, PNG, WebP, GIF) up to 10MB with binary magic-byte verification.
- Filename sanitization, path traversal prevention, random UUID storage names, and thumbnail streaming.

### 4. Content Calendar & Local Scheduling (Phase 1)
- Month, Week, Day, and List views rendered in the configured IANA timezone.
- DST spring-forward validation (rejects nonexistent local wall-clock times) and deterministic fall-back handling.
- PostgreSQL partial unique index prevents concurrent scheduling race conditions.

### 5. Human-in-the-Loop Approval Station (Phase 1)
- Strict review station with top metrics (Awaiting Review, Total Approved, Total Rejected, Total Posts).
- Dual tabs: *Pending Approvals* and *Approval History*.
- Reviewer decisions with optional approval comments or rejection feedback reasons.
- Modifying approved content automatically invalidates approval and cancels active schedules.

### 6. AI Content Studio & Ollama Generation Engine (Phase 2)
- **Local SLM Generation:** Zero-external-dependency AI generation powered by local Ollama (`qwen2.5:3b`).
- **Generation Types:** Ideas (concepts), Structured Captions, Viral Hooks, Targeted Hashtags, Call-to-Actions (CTAs), Content Rewrite, Multi-Slide Carousels, and Multi-Scene Reel Scripts.
- **Carousel & Reel Scripts:** Structured JSON generation output validated by strict Zod schemas with bounded repair cycles.
- **Save-to-Draft Promotion:** Seamless promotion from AI generation history directly into Content Library drafts (`ContentPost`), preserving metadata, slides, and scripts.
- **Generation History & Audit:** Persistent database records (`generation_histories`) linked to users and resulting posts, with atomic deletion.
- **Fail-Closed Concurrency Control:**
  - Single-process PID cooperative lock (`storage/ai-engine.pid`).
  - Request mutex locking (`AI_BUSY`).
  - Pre-inference crash recovery marker (`storage/ai-recovery.lock`).
  - CPU timeout (120s) transition to `RECOVERY_REQUIRED` to protect Windows host resources.
  - Audited operator reset endpoint (`POST /api/v1/ai/engine/reset`).

> **Roadmap Backlog (Future Phases)**:
> - **MP4 Video Transcoding**: Video upload and processing deferred to a dedicated media milestone.
> - **Live Social Media Publishing**: Multi-channel social publishing and OAuth integrations scheduled for Phase 5.

---

## Setup, Migration & Troubleshooting Documentation

Detailed, Windows-tested documentation is available in the `docs/` directory:

- 📖 **[Local Environment Setup Guide](docs/SETUP.md):** Complete fresh Windows PC installation walkthrough from prerequisites to running application.
- 🚀 **[Windows Migration Runbook](docs/WINDOWS_MIGRATION.md):** Step-by-step Office PC → Home PC backup, restore, media transfer, and data integrity verification guide.
- 🛠️ **[Windows Troubleshooting Guide](docs/TROUBLESHOOTING.md):** Diagnostic and recovery solutions for PostgreSQL ports, PowerShell policies, AI lockfiles, and Ollama service issues.

---

## Development & Test Commands

### Prerequisites
- **Node.js**: Minimum `20.14.0` (compatibility baseline derived from toolchain dependencies; verified on `v24.13.1`)
- **npm**: Minimum `10.0.0` (verified on `v11.2.0`)
- **PostgreSQL**: Version 14+ (tested on PostgreSQL 18.0)
- **Ollama**: Running locally with model `qwen2.5:3b`

### Starting DevPilot in Development Mode
Start the backend and frontend in **two separate terminal windows**:

```powershell
# Terminal 1: Fastify Backend API (listens at http://localhost:4000)
npm run dev -w apps/api

# Terminal 2: Next.js Frontend Web (listens at http://localhost:3000)
npm run dev -w apps/web
```

### Verification & Test Suites

```powershell
# 1. Typecheck All Workspaces
npm run --workspaces --if-present typecheck

# 2. Production Build All Workspaces
npm run --workspaces --if-present build

# 3. Fastify Backend Regression Test Suite (17 suites, 322 automated tests)
npm run test:all -w apps/api

# 4. Playwright Browser E2E Test Suite (5 spec files, 23 automated tests)
npx playwright test

# 5. Database Schema & Migration Status
npx prisma validate
npx prisma migrate status
```
