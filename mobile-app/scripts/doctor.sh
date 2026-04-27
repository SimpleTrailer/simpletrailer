#!/usr/bin/env bash
# SimpleTrailer Mobile-App Doctor
# Prueft alle Tools, die zum Build noetig sind. Zeigt Status, gibt Tipps.

set +e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ok()    { echo -e "  ${GREEN}OK${NC}     $1"; }
fail()  { echo -e "  ${RED}FEHLT${NC}  $1"; }
warn()  { echo -e "  ${YELLOW}HINT${NC}   $1"; }
info()  { echo -e "${BLUE}=> $1${NC}"; }

echo
info "SimpleTrailer Mobile-App Doctor"
echo

# Auto-load portable tools wenn vorhanden
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -d "$PROJECT_DIR/tools/jdk-17" ] && export JAVA_HOME="$PROJECT_DIR/tools/jdk-17" && export PATH="$JAVA_HOME/bin:$PATH"
[ -d "$PROJECT_DIR/tools/android-sdk" ] && export ANDROID_HOME="$PROJECT_DIR/tools/android-sdk" && export PATH="$ANDROID_HOME/platform-tools:$PATH"

# Node
info "Node-Umgebung"
if command -v node >/dev/null 2>&1; then
  ok "node $(node --version)"
else
  fail "node nicht im PATH — installiere Node.js LTS"
fi
if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm --version)"
else
  fail "npm nicht im PATH"
fi

# Capacitor
info "Capacitor"
if [ -f "package.json" ] && grep -q '"@capacitor/core"' package.json; then
  ok "Capacitor in package.json"
else
  fail "Im falschen Ordner? Wechsel ins mobile-app/ Verzeichnis."
  exit 1
fi
if [ -d "node_modules/@capacitor/core" ]; then
  ok "node_modules vorhanden"
else
  warn "node_modules fehlt — fuehre 'npm install' aus"
fi

# Android Voraussetzungen
info "Android-Build (optional fuer Android-Targets)"
if command -v java >/dev/null 2>&1; then
  ok "java $(java -version 2>&1 | head -1)"
else
  fail "JDK fehlt — siehe SETUP-NEEDED.md (Adoptium Temurin 17)"
fi
if [ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME" ]; then
  ok "ANDROID_HOME=$ANDROID_HOME"
elif [ -n "$ANDROID_SDK_ROOT" ] && [ -d "$ANDROID_SDK_ROOT" ]; then
  ok "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"
else
  fail "ANDROID_HOME / ANDROID_SDK_ROOT nicht gesetzt — Android Studio installieren"
fi
if command -v adb >/dev/null 2>&1; then
  ok "adb gefunden"
else
  warn "adb nicht im PATH — ergaenze \$ANDROID_HOME/platform-tools"
fi

# iOS Voraussetzungen
info "iOS-Build (nur auf macOS verfuegbar)"
case "$(uname -s)" in
  Darwin*)
    if command -v xcodebuild >/dev/null 2>&1; then
      ok "xcodebuild $(xcodebuild -version | head -1)"
    else
      fail "Xcode nicht installiert — App Store laden"
    fi
    if command -v pod >/dev/null 2>&1; then
      ok "CocoaPods $(pod --version)"
    else
      fail "CocoaPods fehlt — 'sudo gem install cocoapods'"
    fi
    ;;
  *)
    warn "Du bist nicht auf macOS — iOS-Builds nur auf einem Mac moeglich"
    ;;
esac

# Plattformen
info "Capacitor-Plattformen"
[ -d "android" ] && ok "android/ vorhanden" || warn "android/ fehlt — 'npx cap add android'"
[ -d "ios" ] && ok "ios/ vorhanden"     || warn "ios/ fehlt — 'npx cap add ios'"
[ -d "www" ] && ok "www/ vorhanden"     || fail "www/ fehlt — Bootstrapper muss da sein"

# Push-Setup
info "Push Notifications"
[ -f "android/app/google-services.json" ] \
  && ok "google-services.json vorhanden" \
  || warn "google-services.json fehlt — Firebase Setup noetig (siehe SETUP-NEEDED.md)"
[ -f "ios/App/App/GoogleService-Info.plist" ] \
  && ok "GoogleService-Info.plist vorhanden" \
  || warn "GoogleService-Info.plist fehlt (iOS Push)"

# Assets
info "Assets"
[ -f "resources/icon-only.svg" ] && ok "Icon-Quelle vorhanden" || fail "resources/icon-only.svg fehlt"
[ -f "resources/splash.svg" ]    && ok "Splash-Quelle vorhanden" || fail "resources/splash.svg fehlt"
[ -d "android/app/src/main/res/mipmap-xxxhdpi" ] \
  && ok "Android-Icons generiert" \
  || warn "Icons noch nicht generiert — 'npx capacitor-assets generate'"

echo
info "Naechster Schritt"
if ! command -v java >/dev/null 2>&1; then
  echo "  1. JDK 17 installieren (https://adoptium.net)"
  echo "  2. Android Studio installieren (fuer SDK + Emulator)"
  echo "  3. './scripts/doctor.sh' erneut ausfuehren"
elif [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
  echo "  Android Studio einmal starten -> SDK installieren"
  echo "  Dann ANDROID_HOME setzen und Doctor erneut ausfuehren"
else
  echo "  Du bist bereit fuer einen Android-Build:"
  echo "    npx cap sync android"
  echo "    cd android && ./gradlew assembleDebug"
fi
echo
