#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
version=""
output_dir="$repo_root/dist/engicode"

usage() {
  cat <<'EOF'
Build the native Windows EngiCode web installer.

Usage: build-windows-installer.sh --version <version> [--output <directory>]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version=${2:-}
      shift 2
      ;;
    --output)
      output_dir=${2:-}
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 64
      ;;
  esac
done

version=${version#v}
if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)([-+][0-9A-Za-z.-]+)?$ ]]; then
  printf 'Invalid EngiCode installer version: %s\n' "$version" >&2
  exit 64
fi
for command in zig magick; do
  if ! command -v "$command" >/dev/null; then
    printf 'Required installer build command is unavailable: %s\n' "$command" >&2
    exit 69
  fi
done

build_dir="$repo_root/dist/engicode-installer-build"
rm -rf "$build_dir"
mkdir -p "$build_dir" "$output_dir"
printf '#define ENGICODE_VERSION L"%s"\n' "$version" > "$build_dir/version.h"
printf '#define ENGICODE_VERSION_NUMBER %s,%s,%s,0\n#define ENGICODE_VERSION_TEXT "%s"\n' \
  "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "$version" > "$build_dir/resource-version.h"

magick -background none "$script_dir/brand/logo.png" -resize 224x224 -gravity center -extent 256x256 \
  -define icon:auto-resize=256,128,64,48,32,16 "$build_dir/installer.ico"
zig rc /nologo /x /c 65001 /:auto-includes gnu /:output-format coff /:target x86_64 \
  /i "$build_dir" /i "$script_dir/windows" /fo "$build_dir/installer-resource.obj" -- "$script_dir/windows/installer.rc"
zig cc -target x86_64-windows-gnu -O2 -std=c11 -municode -Wl,--subsystem,windows \
  -I "$build_dir" "$script_dir/windows/installer.c" "$build_dir/installer-resource.obj" \
  -o "$output_dir/EngiCodeSetup.exe" -lcomctl32 -ldwmapi -lshell32 -lole32 -luuid -ladvapi32 -lgdi32

installer_sum=$(CDPATH= cd -- "$output_dir" && sha256sum EngiCodeSetup.exe)
if [[ -f "$output_dir/SHA256SUMS" ]]; then
  while read -r sum file; do
    [[ "$file" == "EngiCodeSetup.exe" ]] || printf '%s  %s\n' "$sum" "$file"
  done < "$output_dir/SHA256SUMS" > "$build_dir/SHA256SUMS"
  printf '%s\n' "$installer_sum" >> "$build_dir/SHA256SUMS"
  LC_ALL=C sort -k2 "$build_dir/SHA256SUMS" -o "$output_dir/SHA256SUMS"
fi
printf '%s\n' "$installer_sum"
