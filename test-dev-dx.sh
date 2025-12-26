#!/bin/bash
# Test script to verify Developer Experience setup
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Developer Experience Test                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Testing one-command developer setup...${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}[1/6]${NC} Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ docker-compose not found${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗ pnpm not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Check files exist
echo -e "${BLUE}[2/6]${NC} Checking setup files..."

if [ ! -f "docker-compose.dev.yml" ]; then
    echo -e "${RED}✗ docker-compose.dev.yml not found${NC}"
    exit 1
fi

if [ ! -f "apps/api/.env.example" ]; then
    echo -e "${RED}✗ apps/api/.env.example not found${NC}"
    exit 1
fi

if [ ! -f "QUICKSTART.md" ]; then
    echo -e "${RED}✗ QUICKSTART.md not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Setup files OK${NC}"
echo ""

# Check package.json scripts
echo -e "${BLUE}[3/6]${NC} Checking pnpm scripts..."

if ! grep -q '"dev:full"' package.json; then
    echo -e "${RED}✗ dev:full script not found${NC}"
    exit 1
fi

if ! grep -q '"dev:stop"' package.json; then
    echo -e "${RED}✗ dev:stop script not found${NC}"
    exit 1
fi

if ! grep -q '"dev:clean"' package.json; then
    echo -e "${RED}✗ dev:clean script not found${NC}"
    exit 1
fi

if ! grep -q '"test:security"' package.json; then
    echo -e "${RED}✗ test:security script not found${NC}"
    exit 1
fi

if ! grep -q '"test:cloud"' package.json; then
    echo -e "${RED}✗ test:cloud script not found${NC}"
    exit 1
fi

if ! grep -q '"test:selfhosted"' package.json; then
    echo -e "${RED}✗ test:selfhosted script not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All scripts configured${NC}"
echo ""

# Check dependencies
echo -e "${BLUE}[4/6]${NC} Checking dependencies..."

if ! grep -q '"concurrently"' package.json; then
    echo -e "${RED}✗ concurrently not installed${NC}"
    exit 1
fi

if ! grep -q '"wait-on"' package.json; then
    echo -e "${RED}✗ wait-on not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies OK${NC}"
echo ""

# Check .env.example has sensible defaults
echo -e "${BLUE}[5/6]${NC} Checking .env.example defaults..."

if ! grep -q 'DATABASE_URL="postgresql://postgres:postgres@localhost:6205/synjar_dev' apps/api/.env.example; then
    echo -e "${RED}✗ DATABASE_URL not pointing to docker-compose.dev.yml${NC}"
    exit 1
fi

if ! grep -q 'SMTP_HOST=localhost' apps/api/.env.example; then
    echo -e "${RED}✗ SMTP_HOST not pointing to Mailpit${NC}"
    exit 1
fi

if ! grep -q 'SMTP_PORT=6202' apps/api/.env.example; then
    echo -e "${RED}✗ SMTP_PORT not pointing to Mailpit${NC}"
    exit 1
fi

if ! grep -q 'DEPLOYMENT_MODE=self-hosted' apps/api/.env.example; then
    echo -e "${RED}✗ DEPLOYMENT_MODE not set to self-hosted${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment defaults OK${NC}"
echo ""

# Check security script exists
echo -e "${BLUE}[6/6]${NC} Checking security test script..."

if [ ! -f "../scripts/test-security.sh" ]; then
    echo -e "${RED}✗ ../scripts/test-security.sh not found${NC}"
    exit 1
fi

if [ ! -x "../scripts/test-security.sh" ]; then
    echo -e "${RED}✗ ../scripts/test-security.sh not executable${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Security test script OK${NC}"
echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Test Results                                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
echo ""
echo -e "Your Developer Experience setup is ready!"
echo ""
echo -e "${YELLOW}Quick Start Commands:${NC}"
echo -e "  ${BLUE}pnpm dev:full${NC}        - Start everything (one command!)"
echo -e "  ${BLUE}pnpm dev:stop${NC}        - Stop all containers"
echo -e "  ${BLUE}pnpm dev:clean${NC}       - Clean restart (deletes data)"
echo -e "  ${BLUE}pnpm test:security${NC}   - Run security tests"
echo -e "  ${BLUE}pnpm test:cloud${NC}      - Test cloud mode"
echo -e "  ${BLUE}pnpm test:selfhosted${NC} - Test self-hosted mode"
echo ""
echo -e "${YELLOW}Access Points:${NC}"
echo -e "  Frontend:  ${BLUE}http://localhost:6210${NC}"
echo -e "  API:       ${BLUE}http://localhost:6200${NC}"
echo -e "  API Docs:  ${BLUE}http://localhost:6200/api/docs${NC}"
echo -e "  Mailpit:   ${BLUE}http://localhost:6203${NC}"
echo ""
echo -e "See ${BLUE}QUICKSTART.md${NC} for full guide."
echo ""
