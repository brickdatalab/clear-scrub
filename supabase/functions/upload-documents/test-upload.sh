#!/bin/bash

###############################################################################
# Test Script: upload-documents Edge Function
#
# Usage:
#   1. Get JWT token from dashboard (see instructions below)
#   2. Export token: export TEST_JWT="your-token-here"
#   3. Run: ./test-upload.sh
#
# How to get JWT:
#   - Login to dashboard
#   - Open browser console (F12)
#   - Run: supabase.auth.getSession().then(d => console.log(d.data.session.access_token))
#   - Copy token
###############################################################################

set -e

# Configuration
PROJECT_REF="vnhauomvzjucxadrbywg"
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/upload-documents"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "upload-documents Edge Function Tests"
echo "======================================"
echo ""

# Check if JWT token is set
if [ -z "$TEST_JWT" ]; then
    echo -e "${RED}ERROR: TEST_JWT environment variable not set${NC}"
    echo ""
    echo "To get JWT token:"
    echo "  1. Login to dashboard at https://clearscrub.com"
    echo "  2. Open browser console (F12)"
    echo "  3. Run: supabase.auth.getSession().then(d => console.log(d.data.session.access_token))"
    echo "  4. Copy token"
    echo "  5. Export: export TEST_JWT='your-token-here'"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ JWT token found${NC}"
echo ""

# Create test files
echo "Creating test files..."
TEST_DIR="/tmp/upload-documents-test"
mkdir -p $TEST_DIR

# Create dummy PDF (simple text file with PDF header)
cat > "$TEST_DIR/test-statement.pdf" << EOF
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R /Size 4 >>
%%EOF
EOF

echo -e "${GREEN}✓ Test files created${NC}"
echo ""

###############################################################################
# TEST 1: Successful upload
###############################################################################
echo "======================================"
echo "TEST 1: Successful Upload"
echo "======================================"
echo ""

echo "Uploading test file..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$FUNCTION_URL" \
  -H "Authorization: Bearer $TEST_JWT" \
  -F "files=@$TEST_DIR/test-statement.pdf")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 202 ]; then
    echo -e "${GREEN}✓ TEST 1 PASSED: Upload successful (202 Accepted)${NC}"

    # Extract submission_id and document_id for verification
    SUBMISSION_ID=$(echo "$BODY" | jq -r '.submissions[0].id' 2>/dev/null)
    DOCUMENT_ID=$(echo "$BODY" | jq -r '.submissions[0].documents[0].id' 2>/dev/null)

    echo "  Submission ID: $SUBMISSION_ID"
    echo "  Document ID: $DOCUMENT_ID"
else
    echo -e "${RED}✗ TEST 1 FAILED: Expected 202, got $HTTP_CODE${NC}"
fi
echo ""

###############################################################################
# TEST 2: CORS Preflight
###############################################################################
echo "======================================"
echo "TEST 2: CORS Preflight"
echo "======================================"
echo ""

echo "Sending OPTIONS request..."
CORS_RESPONSE=$(curl -s -i -X OPTIONS \
  "$FUNCTION_URL" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type")

echo "$CORS_RESPONSE"
echo ""

if echo "$CORS_RESPONSE" | grep -q "204"; then
    echo -e "${GREEN}✓ TEST 2 PASSED: CORS preflight successful${NC}"
else
    echo -e "${RED}✗ TEST 2 FAILED: CORS preflight failed${NC}"
fi
echo ""

###############################################################################
# TEST 3: Missing Authorization
###############################################################################
echo "======================================"
echo "TEST 3: Missing Authorization"
echo "======================================"
echo ""

echo "Uploading without JWT token..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$FUNCTION_URL" \
  -F "files=@$TEST_DIR/test-statement.pdf")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 401 ]; then
    echo -e "${GREEN}✓ TEST 3 PASSED: Correctly rejected unauthorized request${NC}"
else
    echo -e "${RED}✗ TEST 3 FAILED: Expected 401, got $HTTP_CODE${NC}"
fi
echo ""

###############################################################################
# TEST 4: No Files Provided
###############################################################################
echo "======================================"
echo "TEST 4: No Files Provided"
echo "======================================"
echo ""

echo "Sending empty request..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$FUNCTION_URL" \
  -H "Authorization: Bearer $TEST_JWT" \
  -H "Content-Type: multipart/form-data")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 400 ]; then
    echo -e "${GREEN}✓ TEST 4 PASSED: Correctly rejected request with no files${NC}"
else
    echo -e "${RED}✗ TEST 4 FAILED: Expected 400, got $HTTP_CODE${NC}"
fi
echo ""

###############################################################################
# TEST 5: Multiple Files
###############################################################################
echo "======================================"
echo "TEST 5: Multiple Files"
echo "======================================"
echo ""

# Create second test file
cp "$TEST_DIR/test-statement.pdf" "$TEST_DIR/test-application.pdf"

echo "Uploading multiple files..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$FUNCTION_URL" \
  -H "Authorization: Bearer $TEST_JWT" \
  -F "files=@$TEST_DIR/test-statement.pdf" \
  -F "files=@$TEST_DIR/test-application.pdf")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 202 ]; then
    FILE_COUNT=$(echo "$BODY" | jq '.summary.total_files' 2>/dev/null)
    if [ "$FILE_COUNT" -eq 2 ]; then
        echo -e "${GREEN}✓ TEST 5 PASSED: Multiple files uploaded successfully${NC}"
    else
        echo -e "${YELLOW}⚠ TEST 5 PARTIAL: Upload succeeded but file count unexpected${NC}"
    fi
else
    echo -e "${RED}✗ TEST 5 FAILED: Expected 202, got $HTTP_CODE${NC}"
fi
echo ""

###############################################################################
# TEST 6: Wrong Method
###############################################################################
echo "======================================"
echo "TEST 6: Wrong HTTP Method"
echo "======================================"
echo ""

echo "Sending GET request (should be POST)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
  "$FUNCTION_URL" \
  -H "Authorization: Bearer $TEST_JWT")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -eq 405 ]; then
    echo -e "${GREEN}✓ TEST 6 PASSED: Correctly rejected wrong method${NC}"
else
    echo -e "${RED}✗ TEST 6 FAILED: Expected 405, got $HTTP_CODE${NC}"
fi
echo ""

###############################################################################
# Cleanup
###############################################################################
echo "======================================"
echo "Cleanup"
echo "======================================"
echo ""

rm -rf $TEST_DIR
echo -e "${GREEN}✓ Test files cleaned up${NC}"
echo ""

###############################################################################
# Summary
###############################################################################
echo "======================================"
echo "Test Summary"
echo "======================================"
echo ""
echo "All tests completed!"
echo ""
echo "Next steps:"
echo "  1. Check Edge Function logs:"
echo "     supabase functions logs upload-documents --project-ref $PROJECT_REF"
echo ""
echo "  2. Verify database records:"
echo "     SELECT * FROM submissions ORDER BY created_at DESC LIMIT 5;"
echo "     SELECT * FROM documents ORDER BY created_at DESC LIMIT 5;"
echo ""
echo "  3. Check storage bucket:"
echo "     Supabase Dashboard → Storage → incoming-documents"
echo ""
