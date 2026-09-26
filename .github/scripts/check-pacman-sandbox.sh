#!/usr/bin/env bash
# Diagnostic only, never a release gate: installs the real pacman package this job just built and
# launches the installed binary directly, with Electron's sandbox left ON (no --no-sandbox, unlike
# every other launch in this repo's CI - see wdio.conf.ts for why that one carries it). Mirrors
# check-deb-sandbox.sh for the Arch package. The launch itself runs as the same non-root user that
# built the package, not root: the sandbox's own purpose is dropping privilege from a normal user,
# and running Electron as uid 0 would not be a representative test of what a real Arch user gets.
# Always exits 0: a finding either way is useful, and this script is not what proves the package
# builds (the caller already did that).
set -uo pipefail

log_file="$(mktemp)"
echo "Diagnostic: launching the installed pacman package's binary with the sandbox enabled (no --no-sandbox)."

pkg_file=$(find packaging/arch -maxdepth 1 -name '*.pkg.tar.zst' -print -quit)
if [[ -z "$pkg_file" ]]; then
  echo "RESULT: inconclusive - no .pkg.tar.zst file found to install."
  exit 0
fi

if ! pacman -U --noconfirm "$pkg_file" >"$log_file" 2>&1; then
  echo "RESULT: inconclusive - could not install the package."
  cat "$log_file"
  exit 0
fi

binary_path="/opt/mangabound/mangabound"
if [[ ! -x "$binary_path" ]]; then
  echo "RESULT: inconclusive - installed but the executable is missing at $binary_path."
  exit 0
fi

if [[ ! -u "$binary_path" ]] && [[ ! -u "$(dirname "$binary_path")/chrome-sandbox" ]]; then
  echo "RESULT: inconclusive - chrome-sandbox does not have its setuid bit; the PKGBUILD's package() step may not have applied."
fi

echo "Installed the package, launching '$binary_path' as a non-root user."
pacman -Sy --noconfirm xorg-server-xvfb >>"$log_file" 2>&1

launch_log="$(mktemp)"
chmod o+r "$launch_log"
# A GUI app that starts cleanly keeps running; `timeout` killing it at the deadline (exit 124) is
# the expected, successful outcome here, not a failure.
su builder -c "xvfb-run --auto-servernum timeout --signal=TERM 10s '$binary_path'" >"$launch_log" 2>&1
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
