#!/bin/bash
set -e

ADB_PATH="/opt/syncthing/sync/5 computadors/56 software/56.40 android-sdk/platform-tools/adb"
PROJECT_DIR="src"
BUILD_DIR="dist"
ANDROID_DEST="/sdcard/BridgeLauncherProjects/PixelLauncher"

echo "🔨 Building the launcher project..."
cd "$PROJECT_DIR"
EXPECTED_VERSION=$(node -p "require('./package.json').version")
EXPECTED_TAG="v$EXPECTED_VERSION"
npm run build
cd ..

./verify-sync-version.sh "$PROJECT_DIR" "$PROJECT_DIR/$BUILD_DIR"

echo "📱 Checking for connected devices..."
"$ADB_PATH" devices

echo "🧹 Clearing old version from phone..."
"$ADB_PATH" shell "rm -rf '$ANDROID_DEST' || true"
"$ADB_PATH" shell "mkdir -p '$ANDROID_DEST'"

echo "🚀 Pushing new version to phone..."
"$ADB_PATH" push "$PROJECT_DIR/$BUILD_DIR/." "$ANDROID_DEST/"

echo "✅ Deployment complete ($EXPECTED_TAG)!"
echo "Now open Bridge Launcher settings on your phone, go to 'Active project' -> 'Change', and select the 'BridgeLauncherProjects/PixelLauncher' folder."
