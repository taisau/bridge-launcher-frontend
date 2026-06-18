#!/bin/bash
set -e

PROJECT_DIR="${1:-src}"
BUILD_DIR="dist"
SYNC_DEST="${2:-phone-sync}"

EXPECTED_VERSION=$(node -p "require('./$PROJECT_DIR/package.json').version")
EXPECTED_TAG="v$EXPECTED_VERSION"

DIST_JS_BUNDLE=$(ls -1t "$PROJECT_DIR/$BUILD_DIR"/assets/index-*.js 2>/dev/null | head -n 1)
if [ -z "$DIST_JS_BUNDLE" ]; then
  echo "❌ No JS bundle found in $PROJECT_DIR/$BUILD_DIR/assets"
  exit 1
fi

if ! grep -q "$EXPECTED_TAG" "$DIST_JS_BUNDLE"; then
  echo "❌ Dist bundle version mismatch. Expected $EXPECTED_TAG in $DIST_JS_BUNDLE"
  exit 1
fi

SYNC_JS_BUNDLE=$(ls -1t "$SYNC_DEST"/assets/index-*.js 2>/dev/null | head -n 1)
if [ -z "$SYNC_JS_BUNDLE" ]; then
  echo "❌ No JS bundle found in $SYNC_DEST/assets"
  exit 1
fi

if ! grep -q "$EXPECTED_TAG" "$SYNC_JS_BUNDLE"; then
  echo "❌ Sync bundle version mismatch. Expected $EXPECTED_TAG in $SYNC_JS_BUNDLE"
  exit 1
fi

echo "✅ Version sync verified: package=$EXPECTED_TAG, dist=$(basename "$DIST_JS_BUNDLE"), sync=$(basename "$SYNC_JS_BUNDLE")"
