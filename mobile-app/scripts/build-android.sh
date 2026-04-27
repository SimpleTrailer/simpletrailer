#!/usr/bin/env bash
# Build Android Debug APK
set -e
cd "$(dirname "$0")/.."

echo "==> Sync Capacitor"
npx cap sync android

echo "==> Build Debug APK"
cd android
./gradlew assembleDebug

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
