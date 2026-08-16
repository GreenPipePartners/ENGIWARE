#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
workspace_root=${ENGICODE_WORKSPACE_ROOT:-$(CDPATH= cd -- "$repo_root/../.." && pwd)}
version=""

usage() {
  cat <<'EOF'
Build Ubuntu 24.04 EngiCode archives in Docker.

Usage: build-ubuntu.sh --version <version>
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version=${2:-}
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
if [[ -z "$version" ]]; then
  printf '%s\n' 'EngiCode version is required.' >&2
  exit 64
fi
version=${version#v}
if [[ ! "$version" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]*$ ]]; then
  printf 'Invalid EngiCode version: %s\n' "$version" >&2
  exit 64
fi
if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' 'Docker is required for the Ubuntu release build.' >&2
  exit 69
fi

case $(uname -m) in
  x86_64)
    if grep -qwi avx2 /proc/cpuinfo 2>/dev/null; then
      verify_target=x64
    else
      verify_target=x64-baseline
    fi
    ;;
  aarch64|arm64) verify_target=arm64 ;;
  *)
    printf 'Unsupported build architecture: %s\n' "$(uname -m)" >&2
    exit 69
    ;;
esac

image="engicode-builder:ubuntu-24.04"
docker build -f "$script_dir/Dockerfile.ubuntu" -t "$image" "$script_dir"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp/engicode-home \
  --volume "$workspace_root:/workspace" \
  --volume "$repo_root:/workspace/10018-GPP-Engiware/opencode" \
  "$image" \
  bash -lc "mkdir -p \"\$HOME\" && bun install --frozen-lockfile --os='*' --cpu='*' && distribution/engicode/build.sh --version '$version'"

docker run --rm \
  --volume "$repo_root:/source:ro" \
  ubuntu:24.04 \
  bash -lc "/source/distribution/engicode/install.sh --artifact /source/dist/engicode/engicode-linux-$verify_target.tar.gz --checksum /source/dist/engicode/SHA256SUMS --prefix /tmp/engicode >/dev/null && /source/distribution/engicode/verify-install.sh /tmp/engicode"
