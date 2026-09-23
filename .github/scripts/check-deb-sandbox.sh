#!/usr/bin/env bash
# Diagnostic only, never a release gate: installs the real .deb this job just built and launches
# the installed binary directly, with Electron's sandbox left ON (no --no-sandbox, unlike every
# other launch in this repo's CI - see wdio.conf.ts for why that one carries it). The goal is to
# observe and record actual behavior on a real Ubuntu machine before anyone writes a workaround
# for a problem that might not apply here. Always exits 0: a finding either way is useful, and this
# script is not what proves `make` works (the caller already did that).
set -uo pipefail

log_file="$(mktemp)"
echo "Diagnostic: launching the installed .deb binary with the sandbox enabled (no --no-sandbox)."

deb_file=$(find out/make/deb -name '*.deb' -print -quit)
if [[ -z "$deb_file" ]]; then
  echo "RESULT: inconclusive - no .deb file found to install."
  exit 0
fi

if ! sudo dpkg -i "$deb_file" >"$log_file" 2>&1; then
  # A .deb built for a normal desktop image can still fail on a fresh runner if it declares a
  # dependency the base image lacks; try once to satisfy it before giving up on installation.
  sudo apt-get update >>"$log_file" 2>&1
  if ! sudo apt-get install -f -y >>"$log_file" 2>&1; then
    echo "RESULT: inconclusive - could not install the .deb."
    cat "$log_file"
    exit 0
  fi
fi

package_name=$(dpkg-deb --field "$deb_file" Package)
binary_path=$(dpkg -L "$package_name" | grep -E '/(bin|opt)/.*mangabound$' | head -1)
if [[ -z "$binary_path" || ! -x "$binary_path" ]]; then
  echo "RESULT: inconclusive - installed but could not find the executable via dpkg -L."
  dpkg -L "$package_name"
  exit 0
fi

echo "Installed package '$package_name', launching '$binary_path'."
sudo apt-get install -y xvfb >>"$log_file" 2>&1

launch_log="$(mktemp)"
# A GUI app that starts cleanly keeps running; `timeout` killing it at the deadline (exit 124) is
# the expected, successful outcome here, not a failure.
xvfb-run --auto-servernum timeout --signal=TERM 10s "$binary_path" >"$launch_log" 2>&1
launch_exit=$?
launch_log_content=$(cat "$launch_log" 2>/dev/null || true)

if grep -qi 'SUID sandbox helper' <<<"$launch_log_content"; then
  echo "RESULT: BLOCKED - the sandbox helper is present but not usable in this environment."
  echo "$launch_log_content"
elif [[ "$launch_exit" -eq 124 ]]; then
  echo "RESULT: LAUNCHED - the app started and was still running when the timeout ended it."
else
  echo "RESULT: inconclusive - exited early (code $launch_exit) for a reason other than the sandbox message."
  echo "$launch_log_content"
fi

exit 0
