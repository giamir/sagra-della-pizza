#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${HOME}/Applications/SagraMisterPOSBridge"
DESKTOP_LAUNCHER="${HOME}/Desktop/MisterPOS Sagra.command"

if [[ ! -f "$SOURCE_DIR/sagra-misterpos-agent.jar" || ! -f "$SOURCE_DIR/sagra-agent-attacher.jar" ]]; then
  if [[ -x "$SOURCE_DIR/package.sh" || -f "$SOURCE_DIR/package.sh" ]]; then
    echo "Creo il bundle bridge prima dell'installazione..."
    bash "$SOURCE_DIR/package.sh" >/dev/null
    SOURCE_DIR="$SOURCE_DIR/dist/SagraMisterPOSBridge"
  fi
fi

if [[ ! -f "$SOURCE_DIR/sagra-misterpos-agent.jar" || ! -f "$SOURCE_DIR/sagra-agent-attacher.jar" ]]; then
  echo "ERRORE: bundle incompleto. Mancano i file JAR del bridge." >&2
  echo "Esegui prima: bash tools/misterpos-bridge/package.sh" >&2
  exit 1
fi

mkdir -p "${HOME}/Applications"
rm -rf "${TARGET_DIR}.tmp"
mkdir -p "${TARGET_DIR}.tmp"

cp -R "$SOURCE_DIR"/. "${TARGET_DIR}.tmp"/
chmod +x "${TARGET_DIR}.tmp/start-misterpos-sagra.command"

rm -rf "$TARGET_DIR"
mv "${TARGET_DIR}.tmp" "$TARGET_DIR"

cat > "$DESKTOP_LAUNCHER" <<EOF
#!/usr/bin/env bash
exec "${TARGET_DIR}/start-misterpos-sagra.command"
EOF
chmod +x "$DESKTOP_LAUNCHER"

echo "Installato in: $TARGET_DIR"
echo "Creato collegamento: $DESKTOP_LAUNCHER"
echo "Apri 'MisterPOS Sagra.command' dal Desktop per avviare MisterPOS con il bridge."

if [[ -t 0 ]]; then
  printf "\nPremi Invio per chiudere questa finestra..."
  read -r _ || true
fi
