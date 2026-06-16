#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
SRC_DIR="$ROOT_DIR/src"
MISTERPOS_JAR="${MISTERPOS_JAR:-/Applications/MisterPOS-2.5/misterpos.jar}"
JAVAC="${JAVAC:-/opt/homebrew/opt/openjdk@11/bin/javac}"
JAR="${JAR:-/opt/homebrew/opt/openjdk@11/bin/jar}"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/classes" "$BUILD_DIR/agent"

"$JAVAC" --release 11 \
  -cp "$MISTERPOS_JAR" \
  -d "$BUILD_DIR/classes" \
  "$SRC_DIR/SagraMisterPosAgent.java" \
  "$SRC_DIR/SagraCartDumpAgent.java" \
  "$SRC_DIR/SagraCatalogRefreshAgent.java"

cat > "$BUILD_DIR/agent/MANIFEST.MF" <<'MANIFEST'
Manifest-Version: 1.0
Agent-Class: SagraMisterPosAgent
Premain-Class: SagraMisterPosAgent
Can-Redefine-Classes: false
Can-Retransform-Classes: false

MANIFEST

"$JAR" cfm "$BUILD_DIR/sagra-misterpos-agent.jar" "$BUILD_DIR/agent/MANIFEST.MF" \
  -C "$BUILD_DIR/classes" .

cat > "$BUILD_DIR/agent/DUMP-MANIFEST.MF" <<'MANIFEST'
Manifest-Version: 1.0
Agent-Class: SagraCartDumpAgent
Can-Redefine-Classes: false
Can-Retransform-Classes: false

MANIFEST

"$JAR" cfm "$BUILD_DIR/sagra-cart-dump-agent.jar" "$BUILD_DIR/agent/DUMP-MANIFEST.MF" \
  -C "$BUILD_DIR/classes" .

cat > "$BUILD_DIR/agent/REFRESH-MANIFEST.MF" <<'MANIFEST'
Manifest-Version: 1.0
Agent-Class: SagraCatalogRefreshAgent
Can-Redefine-Classes: false
Can-Retransform-Classes: false

MANIFEST

"$JAR" cfm "$BUILD_DIR/sagra-catalog-refresh-agent.jar" "$BUILD_DIR/agent/REFRESH-MANIFEST.MF" \
  -C "$BUILD_DIR/classes" .

"$JAVAC" --release 11 \
  --add-modules jdk.attach \
  -d "$BUILD_DIR/classes" \
  "$SRC_DIR/SagraAgentAttacher.java"

cat > "$BUILD_DIR/agent/ATTACHER-MANIFEST.MF" <<'MANIFEST'
Manifest-Version: 1.0
Main-Class: SagraAgentAttacher

MANIFEST

"$JAR" cfm "$BUILD_DIR/sagra-agent-attacher.jar" "$BUILD_DIR/agent/ATTACHER-MANIFEST.MF" \
  -C "$BUILD_DIR/classes" SagraAgentAttacher.class

echo "Built:"
echo "  $BUILD_DIR/sagra-misterpos-agent.jar"
echo "  $BUILD_DIR/sagra-agent-attacher.jar"
echo "  $BUILD_DIR/sagra-cart-dump-agent.jar"
echo "  $BUILD_DIR/sagra-catalog-refresh-agent.jar"
echo "  $BUILD_DIR/classes/SagraAgentAttacher.class"
