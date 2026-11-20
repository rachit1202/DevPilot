# DevPilot

**Product Tagline:** Your AI-powered social media command center.  
**Public Brand:** CodeCulture ("Code. Create. Build. Repeat.")

---

## Architecture Overview

DevPilot is a modular, local-first social media management platform built with:
- **Frontend (`apps/web`):** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, shadcn/ui primitives.
- **Backend (`apps/api`):** Fastify, Node.js, TypeScript, REST API (`/api/v1`).
- **Database (`prisma/`):** PostgreSQL + Prisma ORM with UUID primary keys and strict relational integrity.
- **Shared Packages (`packages/`):**
  - `@devpilot/shared`: Domain types, enums, DTOs.
  - `@devpilot/validation`: Zod validation schemas shared between frontend and backend.
- **Local Storage (`storage/`):** Isolated file storage for media assets.

---

## Getting Started

Refer to [docs/SETUP.md](docs/SETUP.md) for local environment setup, PostgreSQL configuration, and development commands.
