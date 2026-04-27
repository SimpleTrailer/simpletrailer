#!/usr/bin/env bash
# Source this in build-Skripten: setzt JAVA_HOME + ANDROID_HOME auf die lokal portablen Tools.
# Nutzung: source scripts/env.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Portable Tools (im mobile-app/tools/ Ordner)
if [ -d "$PROJECT_DIR/tools/jdk-17" ]; then
  export JAVA_HOME="$PROJECT_DIR/tools/jdk-17"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -d "$PROJECT_DIR/tools/android-sdk" ]; then
  export ANDROID_HOME="$PROJECT_DIR/tools/android-sdk"
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
fi
