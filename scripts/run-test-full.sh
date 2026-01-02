#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMUNITY_ROOT="$SCRIPT_DIR/.."

# Track what we started for cleanup
DEV_DOCKER_STARTED=false

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"

  # Stop dev docker if we started it
  if [ "$DEV_DOCKER_STARTED" = true ]; then
    cd "$COMMUNITY_ROOT"
    docker compose -f docker-compose.dev.yml down 2>/dev/null || true
    echo -e "${YELLOW}✓ Dev containers stopped${NC}"
  fi

  # E2E scripts handle their own cleanup via trap, but ensure test containers are down
  cd "$COMMUNITY_ROOT"
  docker compose -f docker-compose.test.yml down 2>/dev/null || true

  echo -e "${YELLOW}✓ Cleanup complete${NC}"
}

# Trap signals for cleanup
trap cleanup EXIT INT TERM

echo -e "${YELLOW}🚀 Running full test suite...${NC}"

cd "$COMMUNITY_ROOT"

# === PHASE 1: Unit Tests (no docker needed) ===
echo -e "\n${YELLOW}📋 Phase 1: Unit Tests${NC}"
pnpm test
echo -e "${GREEN}✓ Unit tests passed${NC}"

# === PHASE 2: Integration Tests (needs dev docker) ===
echo -e "\n${YELLOW}📋 Phase 2: Integration Tests${NC}"

# Start dev docker for integration tests
echo -e "${YELLOW}📦 Starting dev containers for integration tests...${NC}"
docker compose -f docker-compose.dev.yml up -d postgres
DEV_DOCKER_STARTED=true

# Wait for PostgreSQL
echo -e "${YELLOW}⏳ Waiting for PostgreSQL (dev)...${NC}"
until docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ PostgreSQL (dev) is ready${NC}"

# Run migrations
echo -e "${YELLOW}🔄 Applying migrations...${NC}"
cd apps/api
npx prisma migrate deploy
cd "$COMMUNITY_ROOT"

# Run integration tests
pnpm test:integration
echo -e "${GREEN}✓ Integration tests passed${NC}"

# Stop dev docker before E2E (E2E uses different ports)
echo -e "${YELLOW}🧹 Stopping dev containers...${NC}"
docker compose -f docker-compose.dev.yml down
DEV_DOCKER_STARTED=false

# === PHASE 3: E2E API Tests ===
echo -e "\n${YELLOW}📋 Phase 3: E2E API Tests${NC}"
pnpm test:e2e
echo -e "${GREEN}✓ E2E API tests passed${NC}"

# === PHASE 4: E2E Web Tests ===
echo -e "\n${YELLOW}📋 Phase 4: E2E Web Tests${NC}"
pnpm test:e2e:web
echo -e "${GREEN}✓ E2E Web tests passed${NC}"

echo -e "\n${GREEN}✅ All tests passed!${NC}"
