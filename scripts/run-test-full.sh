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
TEST_DOCKER_STARTED=false

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"

  # Stop test docker if we started it
  if [ "$TEST_DOCKER_STARTED" = true ]; then
    cd "$COMMUNITY_ROOT"
    docker compose -f docker-compose.test.yml down 2>/dev/null || true
    echo -e "${YELLOW}✓ Test containers stopped${NC}"
  fi

  echo -e "${YELLOW}✓ Cleanup complete${NC}"
}

# Interrupt handler - cleanup and exit
interrupt() {
  cleanup
  echo -e "\n${RED}❌ Tests interrupted by user${NC}"
  exit 130  # 128 + 2 (SIGINT)
}

# Trap signals
trap cleanup EXIT
trap interrupt INT TERM

echo -e "${YELLOW}🚀 Running full test suite...${NC}"

cd "$COMMUNITY_ROOT"

# === PHASE 1: Unit Tests (no docker needed) ===
echo -e "\n${YELLOW}📋 Phase 1: Unit Tests${NC}"
pnpm test
echo -e "${GREEN}✓ Unit tests passed${NC}"

# === PHASE 2: Integration Tests (needs test docker) ===
echo -e "\n${YELLOW}📋 Phase 2: Integration Tests${NC}"

# Start test docker for integration tests (same stack as E2E)
echo -e "${YELLOW}📦 Starting test containers...${NC}"
docker compose -f docker-compose.test.yml up -d
TEST_DOCKER_STARTED=true

# Wait for PostgreSQL
echo -e "${YELLOW}⏳ Waiting for PostgreSQL (test)...${NC}"
until docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ PostgreSQL (test) is ready${NC}"

# Run migrations on test database
echo -e "${YELLOW}🔄 Applying migrations...${NC}"
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public" \
DATABASE_URL_MIGRATE="postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public" \
npx prisma migrate deploy
cd "$COMMUNITY_ROOT"

# Run integration tests with test database
DATABASE_URL="postgresql://synjar_app:synjar_app_password@localhost:6311/synjar_test?schema=public" \
DATABASE_URL_MIGRATE="postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public" \
pnpm test:integration
echo -e "${GREEN}✓ Integration tests passed${NC}"

# Note: Test containers stay running for E2E phases

# === PHASE 3: E2E API Tests ===
echo -e "\n${YELLOW}📋 Phase 3: E2E API Tests${NC}"
pnpm test:e2e
echo -e "${GREEN}✓ E2E API tests passed${NC}"

# === PHASE 4: E2E Web Tests ===
echo -e "\n${YELLOW}📋 Phase 4: E2E Web Tests${NC}"
pnpm test:e2e:web
echo -e "${GREEN}✓ E2E Web tests passed${NC}"

echo -e "\n${GREEN}✅ All tests passed!${NC}"
