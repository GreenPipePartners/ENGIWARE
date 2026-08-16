#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
workspace_root=${ENGICODE_WORKSPACE_ROOT:-$(CDPATH= cd -- "$repo_root/../.." && pwd)}
output_dir="$repo_root/dist/engicode"
version=${ENGICODE_VERSION:-}

usage() {
  cat <<'EOF'
Build the native EngiCode Linux release archives.

Usage: build.sh --version <version> [--output <directory>]

Environment:
  ENGICODE_WORKSPACE_ROOT  Parent containing the Engiware and Flux source projects.
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
      usage >&2
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
if [[ $(uname -s) != Linux ]]; then
  printf '%s\n' 'EngiCode release archives must be built on Linux.' >&2
  exit 69
fi

case $(uname -m) in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *)
    printf 'Unsupported build architecture: %s\n' "$(uname -m)" >&2
    exit 69
    ;;
esac

for command in bun uv tar sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required build command is unavailable: %s\n' "$command" >&2
    exit 69
  fi
done

sources=(
  "$workspace_root/10018-GPP-Engiware/engibook"
  "$workspace_root/10018-GPP-Engiware/engibook-host"
  "$workspace_root/100107-GPP-Ignition"
  "$workspace_root/100104-GPP-plc"
  "$workspace_root/100105-GPP-panel"
  "$workspace_root/100106-GPP-schematics"
  "$workspace_root/100101-GPP-flux_deep_plc"
  "$workspace_root/100102-GPP-flux_deep_schematics"
  "$workspace_root/10010-GPP-Flux/mine"
  "$workspace_root/10010-GPP-Flux/panel"
)
for source in "${sources[@]}"; do
  if [[ ! -f "$source/pyproject.toml" ]]; then
    printf 'Python distribution source is unavailable: %s\n' "$source" >&2
    exit 66
  fi
done
bun "$script_dir/source-lock.ts" check --workspace-root "$workspace_root"

mkdir -p "$output_dir"
output_dir=$(CDPATH= cd -- "$output_dir" && pwd)
rm -f "$output_dir"/engicode-linux-*.tar.gz "$output_dir/SHA256SUMS"
work=$(mktemp -d "${TMPDIR:-/tmp}/engicode-build.XXXXXX")
trap 'rm -rf "$work"' EXIT

printf 'Building EngiCode %s for Linux %s\n' "$version" "$arch"
build_flags=(--single --skip-install --outdir="$work/cli")
if [[ "$arch" == x64 ]]; then
  build_flags+=(--baseline)
fi
OPENCODE_CLI_NAME=engicode \
OPENCODE_CHANNEL=engicode \
OPENCODE_VERSION="$version" \
OPENCODE_SOURCEMAP=none \
  bun "$repo_root/packages/cli/script/build.ts" "${build_flags[@]}"

mkdir -p "$work/wheels"
for source in "${sources[@]}"; do
  uv build --wheel --out-dir "$work/wheels" "$source"
done

uv python install --install-dir "$work/python-install" --no-bin 3.12
python_source=""
for candidate in "$work"/python-install/cpython-3.12.*-linux-*-gnu; do
  if [[ -d "$candidate" && ! -L "$candidate" ]]; then
    python_source=$candidate
  fi
done
if [[ -z "$python_source" ]]; then
  printf '%s\n' 'uv did not produce a versioned CPython 3.12 GNU installation.' >&2
  exit 70
fi

package_target() {
  local target=$1
  local suffix=$2
  local cli="$work/cli/cli-$target/bin/engicode"
  local stage="$work/stage-$suffix"
  local archive="$output_dir/engicode-linux-$suffix.tar.gz"
  if [[ ! -x "$cli" ]]; then
    printf 'Compiled EngiCode binary is unavailable: %s\n' "$cli" >&2
    exit 70
  fi

  mkdir -p "$stage/bin" "$stage/lib" "$stage/libexec" "$stage/runtime"
  install -m 755 "$script_dir/launcher.sh" "$stage/bin/engicode"
  install -m 755 "$cli" "$stage/libexec/engicode-core"
  install -m 755 "$script_dir/python-command.sh" "$stage/libexec/engicode-python"
  cp -a "$python_source" "$stage/runtime/python"

  uv pip install \
    --python "$stage/runtime/python/bin/python3" \
    --target "$stage/lib/python" \
    --no-index \
    --no-deps \
    "$work"/wheels/*.whl
  rm -rf "$stage/lib/python/bin" "$stage/lib/python/.lock"
  for metadata in "$stage"/lib/python/*.dist-info/direct_url.json; do
    rm -f "$metadata"
  done

  for command in flux-deep-domain-host engiware-ignition-domain-host engiware-engibook-domain-host; do
    ln -s engicode-python "$stage/libexec/$command"
  done
  for command in engiware-plc-engibook engiware-ignition-engibook engiware-panel-engibook engiware-schematics-engibook flux-deep flux-mine flux-schematics; do
    ln -s ../libexec/engicode-python "$stage/bin/$command"
  done

  printf '%s\n' "$version" > "$stage/VERSION"
  (
    cd "$stage"
    tar --sort=name --owner=0 --group=0 --numeric-owner -czf "$archive" .
  )
}

package_target "linux-$arch" "$arch"
if [[ "$arch" == x64 ]]; then
  package_target "linux-x64-baseline" "x64-baseline"
fi

(
  cd "$output_dir"
  sha256sum engicode-linux-*.tar.gz > SHA256SUMS
)
printf 'EngiCode release artifacts written to %s\n' "$output_dir"
