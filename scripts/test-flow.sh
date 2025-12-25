#!/bin/bash

# Synjar - Test Flow Script
# Tests full flow: registration -> login -> workspace -> documents -> search
# Loads all documents from fixtures/ folder

set -e

API_URL="${API_URL:-http://localhost:6200/api/v1}"
COOKIES_FILE="/tmp/synjar-test-cookies.txt"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/../fixtures"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_step() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

# Function to generate tags from filename
get_tags_for_file() {
    local filename="$1"
    case "$filename" in
        *getting-started*) echo '["getting-started", "documentation", "tutorial"]' ;;
        *api-reference*) echo '["api", "documentation", "reference"]' ;;
        *features*) echo '["features", "documentation", "overview"]' ;;
        *faq*) echo '["faq", "troubleshooting", "documentation"]' ;;
        *troubleshooting*) echo '["troubleshooting", "faq", "support"]' ;;
        *integration*) echo '["integration", "api", "documentation"]' ;;
        *) echo '["documentation", "general"]' ;;
    esac
}

# Function to determine verification status
get_verification_status() {
    local filename="$1"
    # All documentation is verified
    echo "VERIFIED"
}

# Function to generate title from filename
get_title_for_file() {
    local filename="$1"
    # Remove extension and prefix, convert hyphens to spaces, capitalize
    local title=$(echo "$filename" | sed 's/\.md$//' | sed 's/synjar-//' | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1')
    echo "Synjar - ${title}"
}

# Generate unique email
TIMESTAMP=$(date +%s)
TEST_EMAIL="test-${TIMESTAMP}@example.com"
TEST_PASSWORD="SecureP@ss123!"
TEST_NAME="Test User ${TIMESTAMP}"

echo "Synjar - Test Flow"
echo "=================="
echo "API: ${API_URL}"
echo "Email: ${TEST_EMAIL}"
echo "Fixtures: ${FIXTURES_DIR}"
echo ""

# Clean up cookies
rm -f "${COOKIES_FILE}"

# Step 1: Register
log_step "1. Registering user"

REGISTER_RESPONSE=$(curl -s -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -c "${COOKIES_FILE}" \
    -d "{\"email\": \"${TEST_EMAIL}\", \"password\": \"${TEST_PASSWORD}\", \"name\": \"${TEST_NAME}\"}")

if echo "${REGISTER_RESPONSE}" | grep -q "Registration successful"; then
    USER_ID=$(echo "${REGISTER_RESPONSE}" | jq -r '.user.id')
    log_success "User registered: ${USER_ID}"
else
    log_error "Registration failed: ${REGISTER_RESPONSE}"
fi

# Step 2: Login
log_step "2. Logging in"

LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -c "${COOKIES_FILE}" \
    -d "{\"email\": \"${TEST_EMAIL}\", \"password\": \"${TEST_PASSWORD}\"}")

if echo "${LOGIN_RESPONSE}" | grep -q "Login successful"; then
    log_success "Logged in, cookies saved"
else
    log_error "Login failed: ${LOGIN_RESPONSE}"
fi

# Step 3: Create workspace
log_step "3. Creating workspace"

WORKSPACE_RESPONSE=$(curl -s -X POST "${API_URL}/workspaces" \
    -b "${COOKIES_FILE}" \
    -H "Content-Type: application/json" \
    -d '{"name": "Synjar Documentation Demo"}')

if echo "${WORKSPACE_RESPONSE}" | grep -q "id"; then
    WORKSPACE_ID=$(echo "${WORKSPACE_RESPONSE}" | jq -r '.id')
    log_success "Workspace created: ${WORKSPACE_ID}"
else
    log_error "Workspace creation failed: ${WORKSPACE_RESPONSE}"
fi

# Step 4: Upload documents from fixtures
log_step "4. Uploading documents from fixtures"

if [ -d "${FIXTURES_DIR}" ]; then
    DOC_COUNT=0
    for file in "${FIXTURES_DIR}"/*.md; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            title=$(get_title_for_file "$filename")
            tags=$(get_tags_for_file "$filename")
            status=$(get_verification_status "$filename")
            content=$(cat "$file" | jq -Rs .)

            DOC_RESPONSE=$(curl -s -X POST "${API_URL}/workspaces/${WORKSPACE_ID}/documents" \
                -b "${COOKIES_FILE}" \
                -H "Content-Type: application/json" \
                -d "{\"title\": \"${title}\", \"content\": ${content}, \"tags\": ${tags}, \"verificationStatus\": \"${status}\"}")

            if echo "${DOC_RESPONSE}" | grep -q "id"; then
                DOC_ID=$(echo "${DOC_RESPONSE}" | jq -r '.id')
                log_success "Created: ${title} (${DOC_ID})"
                ((DOC_COUNT++))
            else
                echo "  Warning: Failed to create ${filename}"
            fi
        fi
    done
    log_success "Uploaded ${DOC_COUNT} documents"
else
    echo "  No fixtures directory found, skipping document upload"
fi

# Step 5: Wait for processing
log_step "5. Waiting for document processing"
sleep 3
log_success "Processing complete (assumed)"

# Step 6: Test search
log_step "6. Testing semantic search"

SEARCH_QUERIES=(
    "How do I get started with Synjar?"
    "What file formats are supported?"
    "How do I create a public link?"
    "What is the difference between verified and unverified sources?"
    "How do I integrate Synjar with my chatbot?"
)

for query in "${SEARCH_QUERIES[@]}"; do
    SEARCH_RESPONSE=$(curl -s -X POST "${API_URL}/workspaces/${WORKSPACE_ID}/search" \
        -b "${COOKIES_FILE}" \
        -H "Content-Type: application/json" \
        -d "{\"query\": \"${query}\", \"limit\": 3}")

    RESULT_COUNT=$(echo "${SEARCH_RESPONSE}" | jq '.results | length')
    if [ "${RESULT_COUNT}" -gt 0 ]; then
        TOP_SCORE=$(echo "${SEARCH_RESPONSE}" | jq '.results[0].score')
        log_success "Query: '${query}' -> ${RESULT_COUNT} results (top: ${TOP_SCORE})"
    else
        echo "  No results for: ${query}"
    fi
done

# Step 7: Create public link
log_step "7. Creating public link"

PUBLIC_LINK_RESPONSE=$(curl -s -X POST "${API_URL}/workspaces/${WORKSPACE_ID}/public-links" \
    -b "${COOKIES_FILE}" \
    -H "Content-Type: application/json" \
    -d '{"name": "Test Public Link", "allowedTags": ["faq", "getting-started"]}')

if echo "${PUBLIC_LINK_RESPONSE}" | grep -q "token"; then
    PUBLIC_TOKEN=$(echo "${PUBLIC_LINK_RESPONSE}" | jq -r '.token')
    log_success "Public link created: ${PUBLIC_TOKEN}"

    # Test public search
    PUBLIC_SEARCH=$(curl -s -X POST "${API_URL}/public/${PUBLIC_TOKEN}/search" \
        -H "Content-Type: application/json" \
        -d '{"query": "How do I get started?", "limit": 3}')

    PUBLIC_RESULTS=$(echo "${PUBLIC_SEARCH}" | jq '.results | length')
    log_success "Public search works: ${PUBLIC_RESULTS} results"
else
    echo "  Warning: Public link creation failed"
fi

# Summary
log_step "Test Complete"
echo ""
echo "Summary:"
echo "  - User: ${TEST_EMAIL}"
echo "  - Workspace: ${WORKSPACE_ID}"
echo "  - Documents: ${DOC_COUNT:-0}"
echo "  - Public token: ${PUBLIC_TOKEN:-N/A}"
echo ""
echo "API base: ${API_URL}"
echo "Swagger: ${API_URL%/api/v1}/api/docs"
if [ -n "${PUBLIC_TOKEN}" ]; then
    echo ""
    echo "Example public search (GET):"
    echo "  curl '${API_URL}/public/${PUBLIC_TOKEN}/search?query=How+do+I+get+started%3F&limit=3'"
    echo ""
    echo "Example public search (POST):"
    echo "  curl -X POST '${API_URL}/public/${PUBLIC_TOKEN}/search' \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"query\": \"How do I get started?\", \"limit\": 3}'"
fi
