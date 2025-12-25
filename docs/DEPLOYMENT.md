# Deployment Guide

## Overview

Synjar Community can be deployed using several methods. This guide covers the recommended deployment options.

## CapRover Deployment

CapRover is a self-hosted PaaS that makes deployment simple. Synjar includes a `captain-definition` file for easy deployment.

### Prerequisites

- CapRover instance set up and running
- Domain configured and pointing to CapRover
- PostgreSQL with pgvector extension (can use CapRover One-Click Apps)

### Steps

1. **Create a new app** in CapRover dashboard

2. **Set environment variables** in CapRover App Configs:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `DATABASE_URL` | Yes | PostgreSQL connection string |
   | `JWT_SECRET` | Yes | Random string (min 32 chars) |
   | `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings |
   | `B2_KEY_ID` | Yes | Backblaze B2 key ID |
   | `B2_APPLICATION_KEY` | Yes | Backblaze B2 application key |
   | `B2_BUCKET_NAME` | Yes | Backblaze B2 bucket name |
   | `B2_ENDPOINT` | Yes | Backblaze B2 endpoint URL |
   | `PORT` | No | Default: 6200 |
   | `NODE_ENV` | No | Set to `production` |

3. **Deploy using CLI**:
   ```bash
   caprover deploy
   ```

   Or connect your Git repository for automatic deployments.

4. **Enable HTTPS** in CapRover dashboard (Let's Encrypt)

5. **Run database migrations**:
   ```bash
   # SSH into container or use CapRover terminal
   npx prisma migrate deploy
   ```

### Health Check

The API exposes a health endpoint at `/health` that returns:
```json
{"status": "ok", "timestamp": "2025-12-25T15:30:00.000Z"}
```

CapRover will use this to verify deployment success.

## Docker Compose Deployment

For self-hosting without CapRover, use Docker Compose.

### Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/synjar/community.git
   cd community
   ```

2. **Configure environment**:
   ```bash
   cp apps/api/.env.example apps/api/.env
   # Edit apps/api/.env with your configuration
   ```

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Run migrations**:
   ```bash
   docker-compose exec api npx prisma migrate deploy
   ```

### Services

| Service | Port | Description |
|---------|------|-------------|
| API | 6200 | Main NestJS API |
| PostgreSQL | 6201 | Database with pgvector |

## Production Checklist

Before going to production, verify:

- [ ] `NODE_ENV=production` is set
- [ ] `JWT_SECRET` is cryptographically random (use `openssl rand -base64 32`)
- [ ] Database uses dedicated user (not `postgres` superuser)
- [ ] HTTPS is enabled
- [ ] CORS_ORIGINS set to production domain only
- [ ] Rate limiting configured (if applicable)
- [ ] Backups configured for PostgreSQL
- [ ] Monitoring/logging set up

## Troubleshooting

### Port Mismatch
Ensure `PORT=6200` in environment variables matches Dockerfile configuration.

### Database Connection
Verify `DATABASE_URL` format:
```
postgresql://user:password@host:port/database?schema=public
```

### File Upload Fails
Check Backblaze B2 credentials and bucket permissions.

### Container Crashes
Check logs: `docker logs <container_id>` or CapRover logs.

## Alternative Deployments

- **Kubernetes**: Helm chart coming soon
- **Traditional VPS**: Manual Node.js setup (see README.md)
- **Railway/Render**: Use Dockerfile directly
