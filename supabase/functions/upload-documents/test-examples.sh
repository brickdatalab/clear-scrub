#!/bin/bash
###############################################################################
# Quick Test Examples for upload-documents
#
# These are copy-paste ready curl commands for manual testing
###############################################################################

# Set your JWT token first
export TEST_JWT="your-jwt-token-here"

# Or get it from Supabase session (run in browser console):
# supabase.auth.getSession().then(d => console.log(d.data.session.access_token))

PROJECT_REF="vnhauomvzjucxadrbywg"
BASE_URL="https://${PROJECT_REF}.supabase.co/functions/v1"

###############################################################################
# Example 1: Upload single file
###############################################################################
echo "Example 1: Upload single file"
curl -X POST \
  "${BASE_URL}/upload-documents" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -F "files=@./test-statement.pdf" \
  | jq '.'

###############################################################################
# Example 2: Upload multiple files
###############################################################################
echo ""
echo "Example 2: Upload multiple files"
curl -X POST \
  "${BASE_URL}/upload-documents" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -F "files=@./statement1.pdf" \
  -F "files=@./statement2.pdf" \
  -F "files=@./application.pdf" \
  | jq '.'

###############################################################################
# Example 3: Test CORS preflight
###############################################################################
echo ""
echo "Example 3: Test CORS preflight"
curl -X OPTIONS \
  "${BASE_URL}/upload-documents" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type" \
  -i

###############################################################################
# Example 4: Test error - no auth
###############################################################################
echo ""
echo "Example 4: Test error - no auth"
curl -X POST \
  "${BASE_URL}/upload-documents" \
  -F "files=@./test.pdf" \
  | jq '.'

###############################################################################
# Example 5: Test error - no files
###############################################################################
echo ""
echo "Example 5: Test error - no files"
curl -X POST \
  "${BASE_URL}/upload-documents" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  | jq '.'

###############################################################################
# Example 6: Upload with verbose output (debug)
###############################################################################
echo ""
echo "Example 6: Upload with verbose output"
curl -v -X POST \
  "${BASE_URL}/upload-documents" \
  -H "Authorization: Bearer ${TEST_JWT}" \
  -F "files=@./test.pdf" \
  | jq '.'

###############################################################################
# Example 7: Check function status
###############################################################################
echo ""
echo "Example 7: Check function status (should return 401)"
curl -i -X POST "${BASE_URL}/upload-documents"
