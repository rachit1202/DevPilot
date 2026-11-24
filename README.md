# DevPilot

**Product Tagline:** Your AI-powered social media command center.  
**Initial Brand:** CodeCulture ("Code. Create. Build. Repeat.")

---

## Architecture Overview

DevPilot is a modular, local-first social media management command center built with:
- **Frontend (`apps/web`):** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, Lucide icons, and accessible UI primitives.
- **Backend (`apps/api`):** Fastify, Node.js, TypeScript, REST API (`/api/v1`).
- **Database (`prisma/`):** PostgreSQL + Prisma ORM with UUID primary keys and strict relational integrity.
- **Shared Packages (`packages/`):**
  - `@devpilot/shared`: Domain types, enums, DTOs, and DST-safe date utilities (`ianaLocalToUtc`, `utcToIanaLocal`).
  - `@devpilot/validation`: Zod validation schemas shared between frontend and backend.
- **Local Storage (`storage/`):** Isolated file storage for media assets with magic-byte anti-spoofing validation.

---

## Phase 1 Implementation Summary (Foundation & Admin Dashboard)

Phase 1 provides a fully functional, self-hosted, and secure administrative command center:

1. **Authentication & RBAC:**
   - Stateless JWT tokens stored in `HttpOnly`, `SameSite=Lax` cookies.
   - 5-tier role-based access control: `OWNER`, `ADMIN`, `APPROVER`, `EDITOR`, `ANALYST`.
   - CSRF Origin/Referer verification and anti-timing login mitigation.
2. **Brand & Application Settings:**
   - Configurable CodeCulture brand identity (tagline, voice guidelines, pillars, hashtags, colors).
   - Authoritative dynamic IANA timezone management (`ApplicationSettings.timezone`).
3. **Content Library:**
   - Full post lifecycle management (Draft, In Review, Approved, Scheduled, Published, Rejected, Archived).
   - Multi-criteria filtering by Status, Content Type, Category, and keyword search with pagination.
   - Dedicated Inspect/View, Edit, Duplicate, Archive/Restore, and Delete with confirmation.
4. **Media Library:**
   - Secure image uploads (JPEG, PNG, WebP, GIF) up to 10MB with binary magic-byte verification.
   - Filename sanitization, path traversal prevention, random UUID storage names, and thumbnail streaming.
   - Attaching media to content posts (up to 10 assets) and safe deletion of unlinked media.
5. **Content Calendar & Local Scheduling:**
   - Month, Week, Day, and List views rendered in the configured IANA timezone.
   - DST spring-forward validation (rejects nonexistent local wall-clock times) and deterministic fall-back handling.
   - PostgreSQL partial unique index prevents concurrent scheduling race conditions.
6. **Approval Center:**
   - Strict human-in-the-loop review station with top metrics (Awaiting Review, Total Approved, Total Rejected, Total Posts).
   - Dual tabs: *Pending Approvals* and *Approval History*.
   - Reviewer decisions with optional approval comments or rejection feedback reasons.
   - Modifying approved content automatically invalidates approval and cancels active schedules.
7. **Real Dashboard:**
   - Real PostgreSQL-backed aggregate metrics (Total Posts, Published Posts, Scheduled Content, Pending Approvals).
   - Real upcoming schedules and live audit trails.
   - External social analytics clearly designated as *Social Accounts Phase 5 (Not Connected)*.
8. **Activity Audit Logs:**
   - PostgreSQL audit trail tracking content lifecycle, approvals, schedules, and media operations.

> **Deferred Capabilities (PRD Roadmap Backlog)**:
> - **MP4 Video Uploads**: Video upload and transcoding deferred to a dedicated media milestone.
> - **Social Media Integrations**: Live multi-channel publishing and OAuth integrations scheduled for Phase 5.
> - **AI Content Studio & Ollama**: Concept generation, autonomous drafting, and trend research scheduled for Phase 2 & 3.

---

## Verification & Commands

### Prerequisites
- **Node.js**: v18+ (tested on v24)
- **PostgreSQL**: v14+ running locally
- Refer to [docs/SETUP.md](docs/SETUP.md) for local configuration and environment variables.

### Build and Test Commands

```bash
# Validate Prisma Schema
npx prisma validate

# Check Database Migration Status
npx prisma migrate status

# Typecheck All Workspaces
npm run --workspaces --if-present typecheck

# Build All Workspaces (API, Shared, Validation, Web)
npm run --workspaces --if-present build

# Run Complete Fastify Backend Test Suite (115+ tests)
npm run test:all --workspace=@devpilot/api

# Run Complete Playwright Browser E2E Suite (22 tests)
npx playwright test

# Development Mode (Starts Web at :3000 and API at :4000)
npm run dev
```
