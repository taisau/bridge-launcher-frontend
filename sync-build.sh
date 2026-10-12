#!/bin/bash
set -e

PROJECT_DIR="src"
BUILD_DIR="dist"
SYNC_DEST="phone-sync"

echo "📋 Processing app management list..."
node process_app_management.js

echo "⬆️ Bumping version number..."
cd "$PROJECT_DIR"
# Version segments must never exceed a single digit: 0.2.9 rolls to 0.3.0, not
# 0.2.10. Plain `npm version patch` has no such rollover, so compute the next
# version ourselves and hand it to npm.
NEXT_VERSION=$(node -e '
  const [ma, mi, pa] = require("./package.json").version.split(".").map(Number);
  let [a, b, c] = [ma, mi, pa + 1];
  if (c > 9) { c = 0; b += 1; }
  if (b > 9) { b = 0; a += 1; }
  console.log(`${a}.${b}.${c}`);
')
npm version "$NEXT_VERSION" --no-git-tag-version --allow-same-version
NEW_VERSION=$(node -p "require('./package.json').version")
EXPECTED_TAG="v$NEW_VERSION"

echo "🔨 Building the launcher project ($EXPECTED_TAG)..."
npm run build

JS_BUNDLE=$(ls -1t "$BUILD_DIR"/assets/index*.js | head -n 1)
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
cp folders.json "$SYNC_DEST/"
cp hidden_apps.json "$SYNC_DEST/" || true
cp custom_labels.json "$SYNC_DEST/" || true
cp ha-config.json "$SYNC_DEST/" || true
cp calendar-config.json "$SYNC_DEST/" || true
echo "$NEW_VERSION" > "$SYNC_DEST/.build-version"

./verify-sync-version.sh "$PROJECT_DIR" "$SYNC_DEST"

echo "✅ Build complete ($EXPECTED_TAG) and copied to '$SYNC_DEST'!"
