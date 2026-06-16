#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist/SagraMisterPOSBridge"

"$ROOT_DIR/build.sh"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/build/sagra-misterpos-agent.jar" "$DIST_DIR/"
cp "$ROOT_DIR/build/sagra-agent-attacher.jar" "$DIST_DIR/"
cp "$ROOT_DIR/start-misterpos-sagra.command" "$DIST_DIR/"
cp "$ROOT_DIR/install.command" "$DIST_DIR/"
cp "$ROOT_DIR/start-misterpos-sagra.cmd" "$DIST_DIR/"
cp "$ROOT_DIR/start-misterpos-sagra.ps1" "$DIST_DIR/"
cp "$ROOT_DIR/install-windows.cmd" "$DIST_DIR/"
cp "$ROOT_DIR/install-windows.ps1" "$DIST_DIR/"
cp "$ROOT_DIR/README.txt" "$DIST_DIR/"

chmod +x "$DIST_DIR/start-misterpos-sagra.command" "$DIST_DIR/install.command"

echo "Bundle creato:"
echo "  $DIST_DIR"
echo
echo "Per installare:"
echo "  macOS: apri install.command"
echo "  Windows: apri install-windows.cmd"
