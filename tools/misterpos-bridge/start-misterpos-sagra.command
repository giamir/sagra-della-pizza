#!/usr/bin/env bash
set -euo pipefail

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${SAGRA_BRIDGE_PORT:-8787}"
LOG_DIR="${HOME}/Library/Logs/SagraMisterPOSBridge"
mkdir -p "$LOG_DIR"

pause_if_double_clicked() {
  if [[ -t 0 ]]; then
    printf "\nPremi Invio per chiudere questa finestra..."
    read -r _ || true
  fi
}

fail() {
  echo "ERRORE: $*" >&2
  pause_if_double_clicked
  exit 1
}

version_major() {
  "$1" -version 2>&1 | awk -F '"' '/version/ { split($2, parts, "."); if (parts[1] == "1") print parts[2]; else print parts[1]; exit }'
}

java_has_attach() {
  "$1" --list-modules 2>/dev/null | grep -q '^jdk.attach'
}

choose_java() {
  local candidates=()
  candidates+=("/opt/homebrew/opt/openjdk@11/bin/java")
  candidates+=("/usr/local/opt/openjdk@11/bin/java")
  if [[ -n "${JAVA_HOME:-}" ]]; then candidates+=("$JAVA_HOME/bin/java"); fi
  if [[ -x /usr/libexec/java_home ]]; then
    local home
    home="$(/usr/libexec/java_home -v 11+ 2>/dev/null || true)"
    if [[ -n "$home" ]]; then candidates+=("$home/bin/java"); fi
  fi
  candidates+=("$(command -v java 2>/dev/null || true)")

  local java major
  for java in "${candidates[@]}"; do
    if [[ -z "$java" || ! -x "$java" ]]; then continue; fi
    major="$(version_major "$java")"
    if [[ -n "$major" && "$major" -ge 11 ]] && java_has_attach "$java"; then
      echo "$java"
      return 0
    fi
  done
  return 1
}

choose_misterpos_dir() {
  local candidates=()
  if [[ -n "${MISTERPOS_DIR:-}" ]]; then candidates+=("$MISTERPOS_DIR"); fi
  candidates+=("/Applications/MisterPOS-2.5")
  while IFS= read -r dir; do candidates+=("$dir"); done < <(find /Applications -maxdepth 1 -type d -name 'MisterPOS-*' 2>/dev/null | sort -r)

  local dir
  for dir in "${candidates[@]}"; do
    if [[ -f "$dir/misterpos.jar" ]]; then
      echo "$dir"
      return 0
    fi
  done
  return 1
}

find_misterpos_pid() {
  pgrep -f 'misterpos\.Run|/MisterPOS-[^/]+/misterpos\.jar' | while read -r pid; do
    if [[ "$pid" != "$$" ]]; then
      echo "$pid"
      return 0
    fi
  done
}

wait_for_misterpos_pid() {
  local pid=""
  for _ in {1..30}; do
    pid="$(find_misterpos_pid | head -1 || true)"
    if [[ -n "$pid" ]]; then
      echo "$pid"
      return 0
    fi
    sleep 1
  done
  return 1
}

start_misterpos() {
  local java="$1"
  local misterpos_dir="$2"
  local activation="${HOME}/Library/Application Support/MisterPOS-2.5/javax.activation-1.2.0.jar"
  local log_file="$LOG_DIR/misterpos.log"

  echo "Avvio MisterPOS..."
  if [[ -f "$activation" ]]; then
    nohup "$java" \
      -Djava.util.logging.config.file="$misterpos_dir/logging.properties" \
      -cp "$activation:$misterpos_dir/misterpos.jar" \
      misterpos.Run -lang it -user admin -nofull \
      >"$log_file" 2>&1 &
  else
    nohup "$java" \
      -Djava.util.logging.config.file="$misterpos_dir/logging.properties" \
      -jar "$misterpos_dir/misterpos.jar" -lang it -user admin -nofull \
      >"$log_file" 2>&1 &
  fi
}

healthcheck() {
  /usr/bin/curl -sS --max-time 5 "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"ok"[[:space:]]*:[[:space:]]*true'
}

[[ -f "$BRIDGE_DIR/sagra-misterpos-agent.jar" ]] || fail "Manca sagra-misterpos-agent.jar in $BRIDGE_DIR"
[[ -f "$BRIDGE_DIR/sagra-agent-attacher.jar" ]] || fail "Manca sagra-agent-attacher.jar in $BRIDGE_DIR"

JAVA="$(choose_java || true)"
[[ -n "$JAVA" ]] || fail "Installa un JDK Java 11 o superiore. Serve il modulo jdk.attach."

MISTERPOS_DIR="$(choose_misterpos_dir || true)"
[[ -n "$MISTERPOS_DIR" ]] || fail "Non trovo MisterPOS. Imposta MISTERPOS_DIR o installalo in /Applications/MisterPOS-2.5."

echo "Java: $JAVA"
echo "MisterPOS: $MISTERPOS_DIR"
echo "Bridge: http://127.0.0.1:$PORT"

PID="$(find_misterpos_pid | head -1 || true)"
if [[ -z "$PID" ]]; then
  start_misterpos "$JAVA" "$MISTERPOS_DIR"
  PID="$(wait_for_misterpos_pid || true)"
fi
[[ -n "$PID" ]] || fail "MisterPOS non si e' avviato. Controlla $LOG_DIR/misterpos.log"

echo "Processo MisterPOS: $PID"

if ! healthcheck; then
  echo "Collego il bridge a MisterPOS..."
  "$JAVA" --add-modules jdk.attach \
    -jar "$BRIDGE_DIR/sagra-agent-attacher.jar" \
    "$PID" "$BRIDGE_DIR/sagra-misterpos-agent.jar" "port=$PORT" \
    >"$LOG_DIR/attach.log" 2>&1 || {
      cat "$LOG_DIR/attach.log" >&2
      fail "Attach fallito. Verifica che MisterPOS stia usando una JVM compatibile e che il JDK sia installato."
    }
fi

if healthcheck; then
  echo "OK: bridge pronto."
  echo "Dalla cassa usa l'IP LAN di questo Mac e la porta $PORT."
  echo "Log: $LOG_DIR"
  pause_if_double_clicked
  exit 0
fi

fail "Bridge non raggiungibile su 127.0.0.1:$PORT. Controlla firewall, porta occupata o log in $LOG_DIR."
