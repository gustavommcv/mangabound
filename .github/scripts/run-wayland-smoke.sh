#!/usr/bin/env bash
set -euo pipefail

runtime_directory="$(mktemp -d)"
chmod 700 "$runtime_directory"
export XDG_RUNTIME_DIR="$runtime_directory"
export WAYLAND_DISPLAY="wayland-mangabound"
export ELECTRON_OZONE_PLATFORM_HINT="wayland"

weston \
  --backend=headless-backend.so \
  --idle-time=0 \
  --socket="$WAYLAND_DISPLAY" \
  >"$runtime_directory/weston.log" 2>&1 &
weston_pid=$!

cleanup() {
  kill "$weston_pid" 2>/dev/null || true
  wait "$weston_pid" 2>/dev/null || true
  rm -rf -- "$runtime_directory"
}
trap cleanup EXIT

for _ in {1..40}; do
  if [[ -S "$runtime_directory/$WAYLAND_DISPLAY" ]]; then
    MANGABOUND_WAYLAND=1 npm run test:e2e
    exit 0
  fi
  sleep 0.25
done

cat "$runtime_directory/weston.log"
exit 1
