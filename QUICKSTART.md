# Quick Start - Dual-Mode Registration

Get Synjar running in **5 seconds** with full development environment.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

## One-Command Setup

```bash
# 1. Copy environment file (works out-of-box!)
cp apps/api/.env.example apps/api/.env

# 2. Add your API keys to apps/api/.env
# - OPENAI_API_KEY (required for embeddings)
# - B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME (required for file storage)

# 3. Start EVERYTHING
pnpm install
pnpm dev:full
```

**That's it!** The `dev:full` command automatically:
- Starts PostgreSQL + pgvector (port 6205)
- Starts Mailpit SMTP server (SMTP: 6202, Web UI: 6203)
- Starts Redis (port 6379)
- Runs database migrations
- Starts API (port 6200)
- Starts Web frontend (port 6210)

### Access Your Application

- **Frontend:** http://localhost:6210
- **API:** http://localhost:6200
- **API Docs:** http://localhost:6200/api/docs
- **Mailpit (emails):** http://localhost:6203
- **Database:** postgresql://postgres:postgres@localhost:6205/synjar_dev

## Testing Dual-Mode Registration

### Test Self-Hosted Mode (Default)

Self-hosted mode is designed for single-tenant deployments where the first user becomes admin.

```bash
# 1. Ensure DEPLOYMENT_MODE=self-hosted in apps/api/.env (default)

# 2. Clean start
pnpm dev:clean
pnpm dev:full

# 3. Register first user at http://localhost:6210/register
#    - You become admin instantly (no email verification!)
#    - Login works immediately

# 4. Try registering second user
#    - Registration is BLOCKED (403 Forbidden)
#    - Message: "Registration is disabled. Contact admin@yourcompany.com"

# 5. View all emails at http://localhost:6203
```

**Expected behavior:**
- First user: instant admin access
- Second user: registration blocked
- No email verification required (unless you enable it)

### Test Cloud Mode (SaaS)

Cloud mode is designed for multi-tenant SaaS with public registration.

```bash
# 1. Edit apps/api/.env:
DEPLOYMENT_MODE=cloud

# 2. Clean restart
pnpm dev:clean
pnpm dev:full

# 3. Register ANY user at http://localhost:6210/register
#    - Auto-login after registration (instant access!)
#    - 15-minute grace period to explore
#    - Verification email sent

# 4. Check email at http://localhost:6203
#    - Click verification link
#    - Account fully verified

# 5. Register ANOTHER user
#    - Public registration works for all users
#    - Each user gets their own isolated workspace
```

**Expected behavior:**
- Any user can register
- Auto-login with 15-minute grace period
- Email verification required (but optional during grace period)
- Multi-tenant isolation

## Switching Between Modes

```bash
# From self-hosted to cloud
# 1. Edit apps/api/.env: DEPLOYMENT_MODE=cloud
# 2. Restart: pnpm dev:stop && pnpm dev:full

# From cloud to self-hosted
# 1. Edit apps/api/.env: DEPLOYMENT_MODE=self-hosted
# 2. Clean database: pnpm dev:clean && pnpm dev:full
```

**Warning:** Switching modes on existing database may affect user access. Use `dev:clean` for fresh start during testing.

## Automated Security Testing

Run comprehensive security tests for dual-mode registration:

```bash
# Test cloud mode security
pnpm test:cloud

# Test self-hosted mode security
pnpm test:selfhosted

# Or run all security tests
pnpm test:security
```

**What's tested:**
- User enumeration prevention (constant-time responses)
- Rate limiting (3 registration attempts per minute)
- Password strength validation
- Email verification workflow (cloud mode)
- First-user admin creation (self-hosted mode)
- Registration blocking after first user (self-hosted mode)

## Useful Commands

```bash
# Development
pnpm dev:full          # Start everything (one command!)
pnpm dev:stop          # Stop all containers
pnpm dev:clean         # Stop + delete data + migrations (fresh start)
pnpm dev:logs          # View container logs

# Database
pnpm db:migrate        # Run migrations
pnpm db:studio         # Open Prisma Studio (GUI)
pnpm db:seed           # Seed database

# Testing
pnpm test              # Run all tests
pnpm test:e2e          # Run E2E tests
pnpm test:security     # Run security tests
pnpm test:cloud        # Test cloud mode
pnpm test:selfhosted   # Test self-hosted mode
```

## View Emails (Mailpit)

All emails are captured by Mailpit during development:

1. Open http://localhost:6203
2. See all emails sent by the application
3. Click any email to view
4. Test verification links directly

**No real emails are sent during development!**

## Environment Variables Quick Reference

See `apps/api/.env.example` for full documentation.

### Must Change (for real use)

```bash
# External Services
OPENAI_API_KEY=sk-proj-your-key-here
B2_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-app-key
B2_BUCKET_NAME=your-bucket

# Security (production only)
JWT_SECRET=change-in-production-min-32-chars
```

### Already Configured (for local dev)

```bash
# Database (points to docker-compose.dev.yml)
DATABASE_URL=postgresql://postgres:postgres@localhost:6205/synjar_dev

# Email (points to Mailpit)
SMTP_HOST=localhost
SMTP_PORT=6202

# Mode
DEPLOYMENT_MODE=self-hosted
```

## Troubleshooting

### Port already in use

```bash
# Check what's using the port
lsof -i :6205  # PostgreSQL
lsof -i :6200  # API
lsof -i :6210  # Web

# Stop containers
pnpm dev:stop
```

### Database migration errors

```bash
# Clean restart
pnpm dev:clean
pnpm dev:full
```

### Mailpit not receiving emails

```bash
# Check Mailpit is running
curl http://localhost:6203/api/v1/messages

# View logs
pnpm dev:logs

# Verify .env settings
cat apps/api/.env | grep SMTP
```

### API won't start

```bash
# Check environment variables
cat apps/api/.env

# Verify database is ready
docker ps | grep postgres

# View API logs
pnpm dev:logs
```

## Next Steps

- Read [README.md](README.md) for full documentation
- Explore [API documentation](http://localhost:6200/api/docs)
- Check [docs/](docs/) for architecture details
- See [docs/specifications/](docs/specifications/) for feature specs

## Need Help?

- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [GitHub Issues](https://github.com/thesynjar/synjar/issues)
