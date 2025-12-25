# ADR-2025-12-25: API Port Change to 6200

## Status
Accepted

## Context
The default API port was changed from 3000 to 6200 for the Synjar Community project.

## Decision
Use port 6200 as the default API port instead of the common port 3000.

## Rationale
- Port 3000 is commonly used by React, Next.js, and other development tools
- Using 6200 avoids conflicts with other local development servers
- CapRover deployment requires a dedicated port
- Consistent with docker-compose.yml configuration

## Consequences
- All documentation updated to reference port 6200
- Local development: `http://localhost:6200`
- Docker Compose: exposed on port 6200
- CapRover deployment: configured for port 6200
- Frontend CORS configuration includes `localhost:6200`

## Related
- Dockerfile: `ENV PORT=6200`, `EXPOSE 6200`
- docker-compose.yml: `ports: "6200:6200"`
- apps/api/.env.example: `PORT=6200`
- apps/api/src/main.ts: `process.env.PORT || 6200`
