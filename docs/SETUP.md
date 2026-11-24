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
