#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory (needed for cleanup)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Track PIDs for cleanup
API_PID=""
WEB_PID=""

# Cleanup function - kills background processes and stops containers
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"

  # Kill process groups (negative PID kills entire process group including children)
  [ -n "$WEB_PID" ] && kill -- -$WEB_PID 2>/dev/null || true
  [ -n "$API_PID" ] && kill -- -$API_PID 2>/dev/null || true

  # Wait a bit for graceful shutdown
  sleep 1

  # Force kill if still running
  [ -n "$WEB_PID" ] && kill -9 -- -$WEB_PID 2>/dev/null || true
  [ -n "$API_PID" ] && kill -9 -- -$API_PID 2>/dev/null || true

  # Navigate to community root for docker-compose
  cd "$SCRIPT_DIR/../../.."
  docker compose -f docker-compose.test.yml down 2>/dev/null || true

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

echo -e "${YELLOW}🚀 Starting E2E test environment for Playwright...${NC}"

# Navigate to community root
cd "$SCRIPT_DIR/../../.."

# Kill any existing processes on test ports
echo -e "${YELLOW}🧹 Cleaning up test ports...${NC}"
lsof -ti:6300 -ti:6310 | xargs -r kill -9 2>/dev/null || true

# Start test containers
echo -e "${YELLOW}📦 Starting Docker containers...${NC}"
docker compose -f docker-compose.test.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
until docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Wait for Mailpit to be ready
echo -e "${YELLOW}⏳ Waiting for Mailpit...${NC}"
until curl -s http://localhost:6313/api/v1/messages > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ Mailpit is ready${NC}"

# Apply migrations
echo -e "${YELLOW}🔄 Applying database migrations...${NC}"
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public" \
DATABASE_URL_MIGRATE="postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public" \
npx prisma migrate deploy

# Start API in background
echo -e "${YELLOW}🚀 Starting API server...${NC}"
DATABASE_URL="postgresql://postgres:postgres@localhost:6311/synjar_test?schema=public" \
SMTP_HOST=localhost \
SMTP_PORT=6312 \
SMTP_SECURE=false \
JWT_SECRET=test-jwt-secret-for-e2e-tests \
EMAIL_VERIFICATION_URL=http://localhost:6310/auth/verify \
PORT=6300 \
NODE_ENV=test \
DEPLOYMENT_MODE=cloud \
npm run start &
API_PID=$!

# Wait for API to be ready
echo -e "${YELLOW}⏳ Waiting for API...${NC}"
until curl -s http://localhost:6300/health > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ API is ready${NC}"

# Start web app in background
cd ../web
echo -e "${YELLOW}🚀 Starting web app...${NC}"
VITE_API_URL=http://localhost:6300 \
npm run dev -- --port 6310 &
WEB_PID=$!

# Wait for web app to be ready
echo -e "${YELLOW}⏳ Waiting for web app...${NC}"
until curl -s http://localhost:6310 > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ Web app is ready${NC}"

# Run Playwright tests (CI=true disables Playwright's webServer since we start it ourselves)
echo -e "${YELLOW}🧪 Running Playwright E2E tests...${NC}"
TEST_RESULT=0
CI=true \
API_URL=http://localhost:6300 \
MAILPIT_URL=http://localhost:6313 \
BASE_URL=http://localhost:6310 \
npx playwright test "$@" || TEST_RESULT=$?

# Report result (cleanup is handled by trap)
if [ $TEST_RESULT -eq 0 ]; then
  echo -e "${GREEN}✅ All Playwright tests passed!${NC}"
else
  echo -e "${RED}❌ Some Playwright tests failed${NC}"
  exit $TEST_RESULT
fi
