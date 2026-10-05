#!/usr/bin/env bash
# Fails when a Linux package puts something where only root can use it. Unlike the sandbox
# diagnostics next to it this is a gate: the packages are installed by root and run by a person,
# and a bundled tool in a folder only root can enter installs without a word and then keeps every
# conversion from starting. The listing is read from the package file itself, so what is checked
# is what would be installed, not what the build left on the runner.
#
# Usage: check-package-permissions.sh <package.deb|package.rpm|package.pkg.tar.zst>...
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "::error::No package given to check."
  exit 1
fi

failed=0
for package in "$@"; do
  case "$package" in
    *.deb) listing=$(dpkg-deb -c "$package") ;;
    *.rpm) listing=$(rpm -qlvp "$package") ;;
    *.pkg.tar.zst) listing=$(tar --zstd -tvf "$package") ;;
    *)
      echo "::error::Do not know how to list $package."
      exit 1
      ;;
  esac
  if ! node scripts/verify-package-permissions.mjs "$package" <<<"$listing"; then
    failed=1
  fi
done

exit "$failed"
