#!/usr/bin/env bash
set -euo pipefail

if (( $# < 3 )); then
  echo "Usage: bash scripts/verify-macos-release.sh <arm64|x86_64> <version> <app-or-archive>..." >&2
  exit 2
fi

arch=$1
version=$2
shift 2
scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT

verify_app() {
  local app=$1
  local executable
  # An Apple Silicon linker signature can exist without sealing the app bundle.
  test -s "$app/Contents/_CodeSignature/CodeResources"
  codesign --verify --deep --strict --verbose=2 "$app"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$version"
  executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
  lipo -verify_arch "$arch" "$app/Contents/MacOS/$executable"
}

for input in "$@"; do
  printf 'Verifying %s (%s, %s)\n' "$input" "$arch" "$version"
  case "$input" in
    *.app)
      verify_app "$input"
      ;;
    *.zip)
      extracted=$(mktemp -d "$scratch_dir/zip.XXXXXX")
      ditto -x -k "$input" "$extracted"
      verify_app "$extracted/VeraFlow.app"
      ;;
    *.tar.gz)
      extracted=$(mktemp -d "$scratch_dir/tar.XXXXXX")
      tar -xzf "$input" -C "$extracted"
      verify_app "$extracted/VeraFlow.app"
      ;;
    *)
      echo "Expected a .app bundle, .zip, or .tar.gz" >&2
      exit 2
      ;;
  esac
done
