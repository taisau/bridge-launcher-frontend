#!/bin/bash
set -e

PROJECT_DIR="src"
BUILD_DIR="dist"
SYNC_DEST="phone-sync"

echo "📋 Processing app management list..."
node process_app_management.js

echo "⬆️ Bumping version number..."
cd "$PROJECT_DIR"
npm version patch --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
EXPECTED_TAG="v$NEW_VERSION"

echo "🔨 Building the launcher project ($EXPECTED_TAG)..."
npm run build

JS_BUNDLE=$(ls -1t "$BUILD_DIR"/assets/index-*.js | head -n 1)
if [ -z "$JS_BUNDLE" ]; then
  echo "❌ No JS bundle found after build."
  exit 1
fi

if ! grep -q "$EXPECTED_TAG" "$JS_BUNDLE"; then
  echo "❌ Built bundle version mismatch. Expected $EXPECTED_TAG in $JS_BUNDLE"
  exit 1
fi

cd ..

echo "📂 Refreshing the sync folder..."
rm -rf "$SYNC_DEST"
mkdir -p "$SYNC_DEST"

cp -r "$PROJECT_DIR/$BUILD_DIR/." "$SYNC_DEST/"
cp apps.json "$SYNC_DEST/"
cp favorites.json "$SYNC_DEST/"
cp folders.json "$SYNC_DEST/"
cp hidden_apps.json "$SYNC_DEST/" || true
cp custom_labels.json "$SYNC_DEST/" || true
cp ha-config.json "$SYNC_DEST/" || true
echo "$NEW_VERSION" > "$SYNC_DEST/.build-version"

./verify-sync-version.sh "$PROJECT_DIR" "$SYNC_DEST"

echo "✅ Build complete ($EXPECTED_TAG) and copied to '$SYNC_DEST'!"
