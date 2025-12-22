#!/bin/bash

# Script to migrate lucide-react imports to tree-shakeable @/lib/icons imports
# Usage: ./scripts/migrate-icons.sh

set -e

DASHBOARD_ROOT="/Users/vitolo/Desktop/clearscrub_main/clearscrub_dashboard"
SRC_DIR="$DASHBOARD_ROOT/src"

echo "Starting icon import migration..."
echo "This will replace 'lucide-react' imports with '@/lib/icons' imports"
echo ""

# Count files to process
FILE_COUNT=$(grep -rl "from 'lucide-react'" "$SRC_DIR" | wc -l | tr -d ' ')
echo "Found $FILE_COUNT files to migrate"
echo ""

# Perform replacement
if [ "$FILE_COUNT" -gt 0 ]; then
    echo "Replacing imports..."

    # Use sed to replace lucide-react with @/lib/icons
    # macOS uses BSD sed, so we need -i '' for in-place editing
    grep -rl "from 'lucide-react'" "$SRC_DIR" | while read -r file; do
        echo "  Updating: $file"
        sed -i '' "s/from 'lucide-react'/from '@\/lib\/icons'/g" "$file"
    done

    echo ""
    echo "✅ Migration complete!"
    echo ""
    echo "Next steps:"
    echo "1. Test the app: npm run dev"
    echo "2. Check for any import errors in browser console"
    echo "3. Build and verify bundle size: npm run build"
    echo "4. Expected: vendor-icons chunk should be eliminated or <5 KB"
else
    echo "No files found with 'lucide-react' imports"
    echo "Migration may have already been completed"
fi

echo ""
echo "To verify migration:"
echo "  grep -r \"from 'lucide-react'\" $SRC_DIR"
echo "  (should return no results)"
