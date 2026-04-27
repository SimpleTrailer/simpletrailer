#!/usr/bin/env bash
# Build Signed Android Release AAB (fuer Play Store Upload)
# Voraussetzung: android/keystore.properties existiert mit:
#   storeFile=release.keystore
#   storePassword=...
#   keyAlias=simpletrailer
#   keyPassword=...
set -e
cd "$(dirname "$0")/.."

if [ ! -f "android/keystore.properties" ]; then
  echo "✗ android/keystore.properties fehlt"
  echo
  echo "Erstelle zuerst einen Keystore:"
  echo "  cd android"
  echo "  keytool -genkey -v -keystore release.keystore -alias simpletrailer \\"
  echo "          -keyalg RSA -keysize 2048 -validity 10000"
  echo
  echo "Dann lege keystore.properties an (BEISPIEL):"
  cat <<EOF
  storeFile=release.keystore
  storePassword=DEINPASSWORT
  keyAlias=simpletrailer
  keyPassword=DEINPASSWORT
EOF
  exit 1
fi

echo "==> Sync Capacitor"
npx cap sync android

echo "==> Build Release AAB"
cd android
./gradlew bundleRelease

AAB="app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB" ]; then
  SIZE=$(du -h "$AAB" | cut -f1)
  echo
  echo "✓ Release-AAB erstellt"
  echo "  AAB:  android/$AAB"
  echo "  Size: $SIZE"
  echo
  echo "Diese Datei in der Play Console hochladen."
else
  echo "✗ AAB nicht gefunden"
  exit 1
fi
