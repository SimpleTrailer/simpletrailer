#!/usr/bin/env bash
# Installiert portable JDK 17 + Android SDK in mobile-app/tools/
# Kein Admin-Recht noetig, kein Eingriff ins System.
set -e
cd "$(dirname "$0")/.."

mkdir -p tools
cd tools

# 1. JDK 17 (~190 MB)
if [ ! -d "jdk-17" ]; then
  echo "==> Lade JDK 17 (~190 MB)..."
  curl -L -o jdk17.zip "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip"
  echo "==> Entpacke JDK..."
  unzip -q jdk17.zip
  mv "jdk-17.0.13+11" "jdk-17"
  rm jdk17.zip
fi

# 2. Android cmdline-tools (~65 MB)
if [ ! -d "android-sdk/cmdline-tools/latest" ]; then
  echo "==> Lade Android cmdline-tools..."
  curl -L -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
  echo "==> Entpacke cmdline-tools..."
  mkdir -p android-sdk/cmdline-tools
  unzip -q cmdtools.zip -d android-sdk/cmdline-tools/
  mv android-sdk/cmdline-tools/cmdline-tools android-sdk/cmdline-tools/latest
  rm cmdtools.zip
fi

# 3. SDK Platform 34 + Build-Tools + Platform-Tools (~600 MB)
export JAVA_HOME="$(pwd)/jdk-17"
export PATH="$JAVA_HOME/bin:$PATH"

echo "==> Akzeptiere SDK-Lizenzen..."
yes | ./android-sdk/cmdline-tools/latest/bin/sdkmanager.bat --licenses >/dev/null 2>&1 || true

echo "==> Installiere SDK Platform 34 + Build-Tools..."
./android-sdk/cmdline-tools/latest/bin/sdkmanager.bat \
  "platforms;android-34" \
  "build-tools;34.0.0" \
  "platform-tools" 2>&1 | tail -5

# 4. local.properties schreiben (mit forward-slashes wegen Java-Properties-Escape)
SDK_PATH="$(pwd)/android-sdk"
echo "sdk.dir=$SDK_PATH" > ../android/local.properties

echo
echo "✓ Android-Tools installiert in mobile-app/tools/"
echo "  JDK:     mobile-app/tools/jdk-17"
echo "  SDK:     mobile-app/tools/android-sdk"
echo
echo "Naechster Schritt: bash scripts/build-android.sh"
