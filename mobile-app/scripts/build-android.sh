#!/usr/bin/env bash
# Build Android Debug APK (nutzt portable JDK + SDK aus mobile-app/tools/)
set -e
cd "$(dirname "$0")/.."

source scripts/env.sh

if ! command -v java >/dev/null 2>&1; then
  echo "✗ Java nicht gefunden. Tools installieren:  bash scripts/setup-android-tools.sh"
  exit 1
fi

echo "==> Sync Capacitor"
npx cap sync android

echo "==> Build Debug APK"
cd android
./gradlew assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  SIZE=$(du -h "$APK" | cut -f1)
  echo
  echo "✓ Build OK"
  echo "  APK:  android/$APK"
  echo "  Size: $SIZE"
  echo
  echo "Install auf verbundenes Geraet/Emulator:"
  echo "  adb install -r android/$APK"
else
  echo "✗ APK nicht gefunden — Build fehlgeschlagen"
  exit 1
fi
