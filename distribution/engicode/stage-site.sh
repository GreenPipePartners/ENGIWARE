#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
version=""
source_dir="$repo_root/dist/engicode"
output_dir="$repo_root/dist/engicode-site"

usage() {
  cat <<'EOF'
Stage the static files served by engiware.org.

Usage: stage-site.sh --version <version> [--source <artifact-directory>] [--output <site-directory>]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version=${2:-}
      shift 2
      ;;
    --source)
      source_dir=${2:-}
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
if [[ ! "$version" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]*$ ]]; then
  printf 'Invalid EngiCode version: %s\n' "$version" >&2
  exit 64
fi
for file in "$source_dir"/engicode-linux-*.tar.gz "$source_dir/SHA256SUMS"; do
  if [[ ! -f "$file" ]]; then
    printf 'EngiCode release file is unavailable: %s\n' "$file" >&2
    exit 66
  fi
done
if [[ ! -f "$source_dir/EngiCodeSetup.exe" ]]; then
  printf 'EngiCode Windows installer is unavailable: %s\n' "$source_dir/EngiCodeSetup.exe" >&2
  exit 66
fi

node "$script_dir/sync-legal.mjs"
rm -rf "$output_dir"
mkdir -p "$output_dir/enterprise" "$output_dir/providers" "$output_dir/releases/latest" "$output_dir/releases/v$version"
install -m 644 "$script_dir/site/index.html" "$output_dir/index.html"
install -m 644 "$script_dir/brand/logo.png" "$output_dir/logo.png"
cp -R "$script_dir/site/legal" "$output_dir/legal"
install -m 644 "$script_dir/site/enterprise/index.html" "$output_dir/enterprise/index.html"
install -m 644 "$script_dir/site/enterprise/enterprise.css" "$output_dir/enterprise/enterprise.css"
install -m 644 "$script_dir/site/enterprise/enterprise.js" "$output_dir/enterprise/enterprise.js"
install -m 644 "$script_dir/site/providers/anthropic.svg" "$output_dir/providers/anthropic.svg"
install -m 644 "$script_dir/site/providers/openai.svg" "$output_dir/providers/openai.svg"
install -m 644 "$script_dir/site/providers/xai.svg" "$output_dir/providers/xai.svg"
install -m 644 "$script_dir/site/providers/gemini.svg" "$output_dir/providers/gemini.svg"
install -m 644 "$script_dir/install.sh" "$output_dir/install"
install -m 644 "$script_dir/install.ps1" "$output_dir/install.ps1"
install -m 644 "$source_dir/EngiCodeSetup.exe" "$output_dir/EngiCodeSetup.exe"
cp "$source_dir"/engicode-linux-*.tar.gz "$source_dir/EngiCodeSetup.exe" "$source_dir/SHA256SUMS" "$output_dir/releases/v$version/"
printf '%s\n' "$version" > "$output_dir/releases/latest/version"

printf 'EngiCode static site staged at %s\n' "$output_dir"
