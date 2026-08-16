#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
distribution_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
repo_root=$(CDPATH= cd -- "$distribution_dir/../.." && pwd)
site_dir="$repo_root/dist/engicode-site"
version=""
source_dir=""
production=false
bucket=engicode-site
wrangler=(node "$repo_root/packages/www/node_modules/wrangler/bin/wrangler.js" --cwd "$script_dir")

usage() {
  cat <<'EOF'
Upload the EngiCode site to R2 and deploy its Cloudflare Worker.

Usage: deploy.sh --version <version> [--source <artifact-directory>] [--production]

Without --production, Wrangler publishes a workers.dev preview. Production requires the
engiware.org zone to be active in the authenticated Cloudflare account.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version=${2:-}
      shift 2
      ;;
    --production)
      production=true
      shift
      ;;
    --source)
      source_dir=${2:-}
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

stage_args=(--version "$version")
if [[ -n "$source_dir" ]]; then stage_args+=(--source "$source_dir"); fi
"$distribution_dir/stage-site.sh" "${stage_args[@]}"
bucket_list=$("${wrangler[@]}" r2 bucket list)
if [[ "$bucket_list" != *"$bucket"* ]]; then
  "${wrangler[@]}" r2 bucket create "$bucket"
fi

upload() {
  local key=$1
  local file=$2
  local content_type=$3
  local cache_control=$4
  shift 4
  "${wrangler[@]}" r2 object put "$bucket/$key" \
    --remote \
    --file "$file" \
    --content-type "$content_type" \
    --cache-control "$cache_control" \
    "$@"
}

for file in "$site_dir/releases/v$version"/*; do
  name=$(basename -- "$file")
  if [[ "$name" == *.tar.gz ]]; then
    upload "releases/v$version/$name" "$file" application/gzip "public, max-age=31536000, immutable" \
      --content-disposition "attachment; filename=\"$name\""
    continue
  fi
  if [[ "$name" == *.exe ]]; then
    upload "releases/v$version/$name" "$file" application/vnd.microsoft.portable-executable "public, max-age=31536000, immutable" \
      --content-disposition "attachment; filename=\"$name\""
    continue
  fi
  upload "releases/v$version/$name" "$file" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
done

upload index.html "$site_dir/index.html" "text/html; charset=utf-8" no-cache
upload logo.png "$site_dir/logo.png" image/png no-cache
upload enterprise/index.html "$site_dir/enterprise/index.html" "text/html; charset=utf-8" no-cache
upload enterprise/enterprise.css "$site_dir/enterprise/enterprise.css" "text/css; charset=utf-8" no-cache
upload enterprise/enterprise.js "$site_dir/enterprise/enterprise.js" "text/javascript; charset=utf-8" no-cache
upload providers/anthropic.svg "$site_dir/providers/anthropic.svg" image/svg+xml no-cache
upload providers/openai.svg "$site_dir/providers/openai.svg" image/svg+xml no-cache
upload providers/xai.svg "$site_dir/providers/xai.svg" image/svg+xml no-cache
upload providers/gemini.svg "$site_dir/providers/gemini.svg" image/svg+xml no-cache
upload legal/legal.css "$site_dir/legal/legal.css" "text/css; charset=utf-8" no-cache
upload legal/legal.js "$site_dir/legal/legal.js" "text/javascript; charset=utf-8" no-cache
upload legal/privacy-policy/index.html "$site_dir/legal/privacy-policy/index.html" "text/html; charset=utf-8" no-cache
upload legal/terms-of-service/index.html "$site_dir/legal/terms-of-service/index.html" "text/html; charset=utf-8" no-cache
upload install "$site_dir/install" "text/plain; charset=utf-8" no-cache
upload install.ps1 "$site_dir/install.ps1" "text/plain; charset=utf-8" no-cache
upload EngiCodeSetup.exe "$site_dir/EngiCodeSetup.exe" application/vnd.microsoft.portable-executable no-cache \
  --content-disposition 'attachment; filename="EngiCodeSetup.exe"'
upload releases/latest/version "$site_dir/releases/latest/version" "text/plain; charset=utf-8" no-cache

if [[ "$production" == true ]]; then
  "${wrangler[@]}" deploy --env production
  exit
fi
"${wrangler[@]}" deploy --env=""
