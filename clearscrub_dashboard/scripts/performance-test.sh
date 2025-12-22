#!/bin/bash

# Performance Testing Script for ClearScrub Dashboard
# Usage: ./scripts/performance-test.sh

set -e

DASHBOARD_ROOT="/Users/vitolo/Desktop/clearscrub_main/clearscrub_dashboard"
DIST_DIR="$DASHBOARD_ROOT/dist"

echo "======================================"
echo "ClearScrub Dashboard Performance Test"
echo "======================================"
echo ""

# Check if dist exists
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ Error: dist/ folder not found"
    echo "Run 'npm run build' first"
    exit 1
fi

echo "1. Bundle Size Analysis"
echo "========================"
echo ""

# Total dist size
TOTAL_SIZE=$(du -sh "$DIST_DIR" | awk '{print $1}')
echo "Total dist size: $TOTAL_SIZE"
echo ""

# CSS size
echo "CSS Files:"
ls -lh "$DIST_DIR/assets/"*.css 2>/dev/null | awk '{printf "  %s  %s\n", $5, $9}' | sed 's|.*assets/|  |'
echo ""

# JavaScript chunks
echo "JavaScript Chunks (Top 15):"
ls -lh "$DIST_DIR/assets/"*.js 2>/dev/null | sort -k5 -hr | head -15 | awk '{printf "  %s  %s\n", $5, $9}' | sed 's|.*assets/|  |'
echo ""

# Vendor chunk analysis
echo "Vendor Chunks:"
ls -lh "$DIST_DIR/assets/vendor-"*.js 2>/dev/null | awk '{printf "  %s  %s\n", $5, $9}' | sed 's|.*assets/|  |' || echo "  No vendor chunks found"
echo ""

# Calculate gzipped sizes
echo "2. Gzipped Sizes"
echo "================"
echo ""

if command -v gzip &> /dev/null; then
    echo "Main chunks (gzipped estimates):"

    for file in "$DIST_DIR/assets/index-"*.js "$DIST_DIR/assets/vendor-"*.js; do
        if [ -f "$file" ]; then
            ORIGINAL_SIZE=$(ls -lh "$file" | awk '{print $5}')
            GZIPPED_SIZE=$(gzip -c "$file" | wc -c | awk '{print $1}')
            GZIPPED_KB=$((GZIPPED_SIZE / 1024))
            FILENAME=$(basename "$file")
            echo "  $FILENAME: $ORIGINAL_SIZE → ${GZIPPED_KB} KB (gzip)"
        fi
    done
    echo ""
else
    echo "⚠️  gzip command not found, skipping gzip size analysis"
    echo ""
fi

# Check for bundle size targets
echo "3. Performance Budget Check"
echo "==========================="
echo ""

MAIN_CHUNK_SIZE=$(ls -l "$DIST_DIR/assets/index-"*.js 2>/dev/null | awk '{print $5}' | head -1)
MAIN_CHUNK_KB=$((MAIN_CHUNK_SIZE / 1024))

CSS_SIZE=$(ls -l "$DIST_DIR/assets/"*.css 2>/dev/null | awk '{print $5}' | head -1)
CSS_KB=$((CSS_SIZE / 1024))

echo "Main chunk size: ${MAIN_CHUNK_KB} KB"
if [ "$MAIN_CHUNK_KB" -lt 150 ]; then
    echo "  ✅ PASS (target: <150 KB)"
else
    echo "  ❌ FAIL (target: <150 KB)"
fi
echo ""

echo "CSS size: ${CSS_KB} KB"
if [ "$CSS_KB" -lt 50 ]; then
    echo "  ✅ PASS (target: <50 KB)"
else
    echo "  ❌ FAIL (target: <50 KB)"
fi
echo ""

# Check for large chunks
echo "4. Large Chunk Detection"
echo "========================"
echo ""

LARGE_CHUNKS=$(find "$DIST_DIR/assets" -name "*.js" -size +200k 2>/dev/null | wc -l | tr -d ' ')
if [ "$LARGE_CHUNKS" -eq 0 ]; then
    echo "✅ No chunks exceed 200 KB"
else
    echo "⚠️  Found $LARGE_CHUNKS chunks >200 KB:"
    find "$DIST_DIR/assets" -name "*.js" -size +200k 2>/dev/null | while read -r file; do
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        FILENAME=$(basename "$file")
        echo "    $FILENAME ($SIZE)"
    done
fi
echo ""

# Check chunking strategy
echo "5. Chunking Strategy Verification"
echo "=================================="
echo ""

VENDOR_CHUNK_COUNT=$(ls -1 "$DIST_DIR/assets/vendor-"*.js 2>/dev/null | wc -l | tr -d ' ')
ROUTE_CHUNK_COUNT=$(ls -1 "$DIST_DIR/assets/" 2>/dev/null | grep -v "^vendor-" | grep -v "^index-" | grep "\.js$" | wc -l | tr -d ' ')

echo "Vendor chunks: $VENDOR_CHUNK_COUNT"
if [ "$VENDOR_CHUNK_COUNT" -ge 5 ]; then
    echo "  ✅ Good chunking strategy (5+ vendor chunks)"
else
    echo "  ⚠️  Consider manual chunking in vite.config.ts"
fi
echo ""

echo "Route chunks: $ROUTE_CHUNK_COUNT"
if [ "$ROUTE_CHUNK_COUNT" -ge 8 ]; then
    echo "  ✅ Good code splitting (8+ route chunks)"
else
    echo "  ⚠️  Consider lazy loading more routes"
fi
echo ""

# Check for source maps (should be disabled in production)
echo "6. Production Build Checks"
echo "=========================="
echo ""

SOURCE_MAPS=$(find "$DIST_DIR" -name "*.js.map" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SOURCE_MAPS" -eq 0 ]; then
    echo "✅ Source maps disabled (good for production)"
else
    echo "⚠️  Found $SOURCE_MAPS source maps (should disable in production)"
fi
echo ""

# Index.html size
INDEX_SIZE=$(ls -lh "$DIST_DIR/index.html" 2>/dev/null | awk '{print $5}')
echo "index.html size: $INDEX_SIZE"
if [ -f "$DIST_DIR/index.html" ]; then
    PRELOAD_COUNT=$(grep -c "modulepreload" "$DIST_DIR/index.html" 2>/dev/null || echo "0")
    if [ "$PRELOAD_COUNT" -gt 0 ]; then
        echo "  ✅ Found $PRELOAD_COUNT modulepreload hints"
    else
        echo "  ⚠️  No modulepreload hints (consider adding in vite.config.ts)"
    fi
fi
echo ""

# Summary
echo "================================="
echo "Performance Test Summary"
echo "================================="
echo ""
echo "✅ Completed bundle size analysis"
echo "✅ Verified chunking strategy"
echo "✅ Checked production build settings"
echo ""
echo "Next steps:"
echo "1. Deploy to production: vercel --prod"
echo "2. Test live performance with Chrome DevTools"
echo "3. Run Lighthouse audit: npm run lighthouse (if configured)"
echo "4. Check real-world metrics at https://dashboard.clearscrub.io"
echo ""
echo "For detailed optimization guide, see:"
echo "  /Users/vitolo/Desktop/clearscrub_main/clearscrub_dashboard/OPTIMIZATION_GUIDE.md"
