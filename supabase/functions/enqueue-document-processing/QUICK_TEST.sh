#!/bin/bash
# Quick test script for enqueue-document-processing Edge Function
# Usage: ./QUICK_TEST.sh [JWT_TOKEN] [DOC_ID]

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FUNCTION_URL="https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/enqueue-document-processing"

echo "=========================================="
echo "enqueue-document-processing Test Suite"
echo "=========================================="
echo ""

# Test 1: OPTIONS Preflight
echo -e "${YELLOW}Test 1: OPTIONS Preflight (CORS)${NC}"
RESPONSE=$(curl -s -X OPTIONS "$FUNCTION_URL" -w "\nHTTP_CODE:%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ PASS${NC} - Status: $HTTP_CODE"
else
  echo -e "${RED}❌ FAIL${NC} - Status: $HTTP_CODE"
fi
echo ""

# Test 2: Missing Authorization
echo -e "${YELLOW}Test 2: Missing Authorization Header${NC}"
RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"doc_id":"test-doc-123"}' \
  -w "\nHTTP_CODE:%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✅ PASS${NC} - Status: $HTTP_CODE"
  echo "Response: $BODY"
else
  echo -e "${RED}❌ FAIL${NC} - Status: $HTTP_CODE"
  echo "Response: $BODY"
fi
echo ""

# Test 3: Invalid JWT
echo -e "${YELLOW}Test 3: Invalid JWT Token${NC}"
RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token-123" \
  -d '{"doc_id":"test-doc-123"}' \
  -w "\nHTTP_CODE:%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✅ PASS${NC} - Status: $HTTP_CODE"
  echo "Response: $BODY"
else
  echo -e "${RED}❌ FAIL${NC} - Status: $HTTP_CODE"
  echo "Response: $BODY"
fi
echo ""

# Test 4: Valid JWT with Missing doc_id
if [ -n "$1" ]; then
  JWT_TOKEN="$1"
  echo -e "${YELLOW}Test 4: Valid JWT with Missing doc_id${NC}"
  RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d '{}' \
    -w "\nHTTP_CODE:%{http_code}")
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

  if [ "$HTTP_CODE" = "400" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Status: $HTTP_CODE"
    echo "Response: $BODY"
  else
    echo -e "${RED}❌ FAIL${NC} - Status: $HTTP_CODE (expected 400)"
    echo "Response: $BODY"
  fi
  echo ""
else
  echo -e "${YELLOW}Test 4: Valid JWT with Missing doc_id${NC}"
  echo -e "${YELLOW}⏭️  SKIPPED${NC} - No JWT token provided"
  echo "Usage: ./QUICK_TEST.sh [JWT_TOKEN] [DOC_ID]"
  echo ""
fi

# Test 5: Valid JWT with Real doc_id (Happy Path)
if [ -n "$1" ] && [ -n "$2" ]; then
  JWT_TOKEN="$1"
  DOC_ID="$2"
  echo -e "${YELLOW}Test 5: Valid JWT with Real doc_id (Happy Path)${NC}"
  RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d "{\"doc_id\":\"$DOC_ID\"}" \
    -w "\nHTTP_CODE:%{http_code}")
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

  if [ "$HTTP_CODE" = "202" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Status: $HTTP_CODE"
    echo "Response: $BODY"
    echo ""
    echo "Next Steps:"
    echo "1. Check document status in database:"
    echo "   SELECT id, status, processing_started_at FROM documents WHERE id = '$DOC_ID';"
    echo ""
    echo "2. Check function logs:"
    echo "   https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg/functions/enqueue-document-processing/logs"
  elif [ "$HTTP_CODE" = "404" ]; then
    echo -e "${YELLOW}⚠️  WARN${NC} - Status: $HTTP_CODE (document not found or access denied)"
    echo "Response: $BODY"
    echo ""
    echo "This means either:"
    echo "- The doc_id doesn't exist"
    echo "- The user doesn't have access to this document (RLS)"
  else
    echo -e "${RED}❌ FAIL${NC} - Status: $HTTP_CODE (expected 202)"
    echo "Response: $BODY"
  fi
  echo ""
else
  echo -e "${YELLOW}Test 5: Valid JWT with Real doc_id (Happy Path)${NC}"
  echo -e "${YELLOW}⏭️  SKIPPED${NC} - No JWT token or DOC_ID provided"
  echo "Usage: ./QUICK_TEST.sh [JWT_TOKEN] [DOC_ID]"
  echo ""
fi

echo "=========================================="
echo "Test Suite Complete"
echo "=========================================="
echo ""
echo "To run full tests, provide JWT token and DOC_ID:"
echo "  ./QUICK_TEST.sh {JWT_TOKEN} {DOC_ID}"
echo ""
echo "To get JWT token:"
echo "  1. Login to https://dashboard.clearscrub.io"
echo "  2. Open DevTools > Application > Local Storage"
echo "  3. Copy 'access_token' from 'supabase.auth.token'"
echo ""
