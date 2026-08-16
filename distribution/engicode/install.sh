#!/usr/bin/env bash
set -euo pipefail

repository=${ENGICODE_REPOSITORY:-GreenPipePartners/ENGIWARE}
release_base_url=${ENGICODE_RELEASE_BASE_URL:-https://engiware.org/releases}
requested_version=${ENGICODE_VERSION:-}
prefix=${ENGICODE_PREFIX:-}
artifact_path=""
checksum_path=""

usage() {
  cat <<'EOF'
EngiCode native Linux installer

Usage: install.sh [options]

Options:
  -v, --version <version>    Install a tagged version instead of latest.
      --prefix <directory>   Installation prefix (default: /usr/local for root, ~/.local otherwise).
      --repository <owner/repository>
                             GitHub release repository.
      --base-url <url>       Release mirror containing v<version>/<artifact>.
      --artifact <path>      Install a local release archive.
      --checksum <path>      SHA256SUMS for a local release archive.
  -h, --help                 Show this help.

The archive includes EngiCode, CPython, and all engineering domain hosts.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version)
      requested_version=${2:-}
      shift 2
      ;;
    --prefix)
      prefix=${2:-}
      shift 2
      ;;
    --repository)
      repository=${2:-}
      release_base_url=""
      shift 2
      ;;
    --base-url)
      release_base_url=${2:-}
      shift 2
      ;;
    --artifact)
      artifact_path=${2:-}
      shift 2
      ;;
    --checksum)
      checksum_path=${2:-}
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

if [[ $(uname -s) != Linux ]]; then
  printf '%s\n' 'This installer supports Linux. Use install.ps1 on Windows.' >&2
  exit 69
fi
case $(uname -m) in
  x86_64) target=x64 ;;
  aarch64|arm64) target=arm64 ;;
  *)
    printf 'Unsupported architecture: %s\n' "$(uname -m)" >&2
    exit 69
    ;;
esac
if [[ "$target" == x64 ]] && ! grep -qwi avx2 /proc/cpuinfo 2>/dev/null; then
  target=x64-baseline
fi

for command in tar sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required installation command is unavailable: %s\n' "$command" >&2
    exit 69
  fi
done
if [[ -z "$artifact_path" ]] && ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required to download EngiCode.' >&2
  exit 69
fi

if [[ -z "$prefix" ]]; then
  if [[ $(id -u) -eq 0 ]]; then
    prefix=/usr/local
  else
    prefix="$HOME/.local"
  fi
fi
if [[ "$prefix" != /* ]]; then
  printf 'Installation prefix must be absolute: %s\n' "$prefix" >&2
  exit 64
fi
if [[ ! "$repository" =~ ^[0-9A-Za-z_.-]+/[0-9A-Za-z_.-]+$ ]]; then
  printf 'Invalid GitHub repository: %s\n' "$repository" >&2
  exit 64
fi
if [[ -n "$requested_version" ]]; then
  requested_version=${requested_version#v}
  if [[ ! "$requested_version" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]*$ ]]; then
    printf 'Invalid EngiCode version: %s\n' "$requested_version" >&2
    exit 64
  fi
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/engicode-install.XXXXXX")
stage=""
trap 'rm -rf "$work"; [[ -z "$stage" ]] || rm -rf "$stage"' EXIT

if [[ -n "$artifact_path" ]]; then
  if [[ ! -f "$artifact_path" ]]; then
    printf 'EngiCode archive does not exist: %s\n' "$artifact_path" >&2
    exit 66
  fi
  archive=$(readlink -f -- "$artifact_path")
  manifest=${checksum_path:+$(readlink -f -- "$checksum_path")}
else
  if [[ -z "$requested_version" ]]; then
    if [[ -n "$release_base_url" ]]; then
      requested_version=$(curl -fsSL "${release_base_url%/}/latest/version" | tr -d '\r\n')
      requested_version=${requested_version#v}
    else
      metadata=$(curl -fsSL "https://api.github.com/repos/$repository/releases/latest")
      requested_version=$(printf '%s' "$metadata" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | sed -n '1p')
    fi
    if [[ -z "$requested_version" ]]; then
      printf 'Unable to resolve the latest EngiCode release from %s.\n' "$repository" >&2
      exit 69
    fi
  fi
  if [[ ! "$requested_version" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]*$ ]]; then
    printf 'Release metadata contains an invalid EngiCode version: %s\n' "$requested_version" >&2
    exit 65
  fi
  filename="engicode-linux-$target.tar.gz"
  if [[ -n "$release_base_url" ]]; then
    url="${release_base_url%/}/v$requested_version/$filename"
    checksum_url="${release_base_url%/}/v$requested_version/SHA256SUMS"
  else
    url="https://github.com/$repository/releases/download/v$requested_version/$filename"
    checksum_url="https://github.com/$repository/releases/download/v$requested_version/SHA256SUMS"
  fi
  archive="$work/$filename"
  manifest="$work/SHA256SUMS"
  curl -fL --retry 3 --output "$archive" "$url"
  curl -fL --retry 3 --output "$manifest" "$checksum_url"
fi

filename=$(basename -- "$archive")
if [[ -n "${manifest:-}" ]]; then
  if [[ ! -f "$manifest" ]]; then
    printf 'Checksum manifest does not exist: %s\n' "$manifest" >&2
    exit 66
  fi
  digest=$(sed -n "s/^\([0-9A-Fa-f]\{64\}\)[[:space:]]\+[*]*${filename//./\.}\{0,1\}$/\1/p" "$manifest")
  if [[ ! "$digest" =~ ^[0-9A-Fa-f]{64}$ ]]; then
    printf 'No valid checksum found for %s.\n' "$filename" >&2
    exit 65
  fi
  actual=$(sha256sum "$archive")
  actual=${actual%% *}
  if [[ "${actual,,}" != "${digest,,}" ]]; then
    printf 'Checksum verification failed for %s.\n' "$filename" >&2
    exit 65
  fi
fi

while IFS= read -r member; do
  case "$member" in
    /*|../*|*/../*|*/..) printf 'Unsafe archive member: %s\n' "$member" >&2; exit 65 ;;
  esac
done < <(tar -tzf "$archive")

mkdir -p "$prefix/lib/engicode" "$prefix/bin"
stage=$(mktemp -d "$prefix/lib/engicode/.install.XXXXXX")
tar --no-same-owner -xzf "$archive" -C "$stage"
commands=(
  engicode
  engiware-plc-engibook
  engiware-ignition-engibook
  engiware-panel-engibook
  engiware-schematics-engibook
  flux-deep
  flux-mine
  flux-schematics
)
if [[ ! -x "$stage/libexec/engicode-core" || ! -x "$stage/runtime/python/bin/python3" || ! -f "$stage/VERSION" ]]; then
  printf '%s\n' 'EngiCode archive is incomplete.' >&2
  exit 65
fi
for command in "${commands[@]}"; do
  if [[ ! -x "$stage/bin/$command" ]]; then
    printf 'EngiCode archive is missing command: %s\n' "$command" >&2
    exit 65
  fi
done
version=$(tr -d '\r\n' < "$stage/VERSION")
if [[ ! "$version" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]*$ ]]; then
  printf 'EngiCode archive contains an invalid version: %s\n' "$version" >&2
  exit 65
fi

destination="$prefix/lib/engicode/$version"
backup="$prefix/lib/engicode/.previous.$version.$$"
if [[ -e "$destination" ]]; then
  mv "$destination" "$backup"
fi
mv "$stage" "$destination"
stage=""
rm -rf "$backup"

for command in "${commands[@]}"; do
  link="$prefix/bin/.$command.$$"
  ln -s "../lib/engicode/$version/bin/$command" "$link"
  mv -Tf "$link" "$prefix/bin/$command"
done

installed=$($prefix/bin/engicode --version)
printf 'Installed %s at %s/bin/engicode\n' "$installed" "$prefix"
case ":$PATH:" in
  *":$prefix/bin:"*) ;;
  *) printf 'Add %s/bin to PATH before invoking engicode.\n' "$prefix" ;;
esac
