#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Starting E2E test environment...${NC}"

# Navigate to community root
cd "$(dirname "$0")/../../.."

# Start test containers
echo -e "${YELLOW}📦 Starting Docker containers...${NC}"
docker-compose -f docker-compose.test.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
until docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Wait for Mailpit to be ready
echo -e "${YELLOW}⏳ Waiting for Mailpit...${NC}"
until curl -s http://localhost:6203/api/v1/messages > /dev/null 2>&1; do
  sleep 1
done
echo -e "${GREEN}✓ Mailpit is ready${NC}"

# Apply migrations
echo -e "${YELLOW}🔄 Applying database migrations...${NC}"
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public" \
DATABASE_URL_MIGRATE="postgresql://postgres:postgres@localhost:6211/synjar_test?schema=public" \
npx prisma migrate deploy

# Run tests
echo -e "${YELLOW}🧪 Running E2E tests...${NC}"
TEST_RESULT=0
npx jest --config ./test/jest-e2e.json --testPathPattern="${1:-registration}" --runInBand || TEST_RESULT=$?

# Cleanup
cd ../..
echo -e "${YELLOW}🧹 Stopping Docker containers...${NC}"
docker-compose -f docker-compose.test.yml down

if [ $TEST_RESULT -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit $TEST_RESULT
fi
