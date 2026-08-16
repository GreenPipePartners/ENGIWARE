#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
distribution_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
repo_root=$(CDPATH= cd -- "$distribution_dir/../.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/engicode-cloudflare-test.XXXXXX")
port=18766
server_pid=""
trap '[[ -z "$server_pid" ]] || kill "$server_pid" 2>/dev/null || true; rm -rf "$work"' EXIT
wrangler=(node "$repo_root/packages/www/node_modules/wrangler/bin/wrangler.js" --cwd "$script_dir")

put() {
  "${wrangler[@]}" r2 object put "engicode-site/$1" \
    --local \
    --persist-to "$work/state" \
    --file "$2" \
    --content-type "$3" \
    --cache-control "$4"
}

put index.html "$distribution_dir/site/index.html" "text/html; charset=utf-8" no-cache
put enterprise/index.html "$distribution_dir/site/enterprise/index.html" "text/html; charset=utf-8" no-cache
put enterprise/enterprise.css "$distribution_dir/site/enterprise/enterprise.css" "text/css; charset=utf-8" no-cache
put enterprise/enterprise.js "$distribution_dir/site/enterprise/enterprise.js" "text/javascript; charset=utf-8" no-cache
put providers/anthropic.svg "$distribution_dir/site/providers/anthropic.svg" image/svg+xml no-cache
put providers/openai.svg "$distribution_dir/site/providers/openai.svg" image/svg+xml no-cache
put providers/xai.svg "$distribution_dir/site/providers/xai.svg" image/svg+xml no-cache
put providers/gemini.svg "$distribution_dir/site/providers/gemini.svg" image/svg+xml no-cache
put legal/legal.css "$distribution_dir/site/legal/legal.css" "text/css; charset=utf-8" no-cache
put legal/legal.js "$distribution_dir/site/legal/legal.js" "text/javascript; charset=utf-8" no-cache
put legal/privacy-policy/index.html "$distribution_dir/site/legal/privacy-policy/index.html" "text/html; charset=utf-8" no-cache
put legal/terms-of-service/index.html "$distribution_dir/site/legal/terms-of-service/index.html" "text/html; charset=utf-8" no-cache
put install "$distribution_dir/install.sh" "text/plain; charset=utf-8" no-cache
put releases/latest/version "$distribution_dir/site/index.html" "text/plain; charset=utf-8" no-cache
put releases/vtest/fixture.tar.gz "$distribution_dir/install.sh" application/gzip "public, max-age=31536000, immutable"

"${wrangler[@]}" dev \
  --local \
  --persist-to "$work/state" \
  --ip 127.0.0.1 \
  --port "$port" \
  --show-interactive-dev-session=false \
  >"$work/server.log" 2>&1 &
server_pid=$!

ready=false
for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  cat "$work/server.log" >&2
  exit 70
fi

root_headers=$(curl -fsSI "http://127.0.0.1:$port/")
[[ "$root_headers" == *"200 OK"* ]]
[[ "${root_headers,,}" == *"content-type: text/html"* ]]
[[ "${root_headers,,}" == *"content-security-policy:"* ]]
[[ "${root_headers,,}" == *"cache-control: no-cache"* ]]
root_body=$(curl -fsS "http://127.0.0.1:$port/")
[[ "$root_body" == *'<code>engiware</code>'* ]]

enterprise_headers=$(curl -fsSI "http://127.0.0.1:$port/enterprise")
[[ "$enterprise_headers" == *"200 OK"* ]]
[[ "${enterprise_headers,,}" == *"content-type: text/html"* ]]
[[ "${enterprise_headers,,}" == *"form-action mailto:"* ]]

enterprise_css_headers=$(curl -fsSI "http://127.0.0.1:$port/enterprise/enterprise.css")
[[ "${enterprise_css_headers,,}" == *"content-type: text/css"* ]]

enterprise_js_headers=$(curl -fsSI "http://127.0.0.1:$port/enterprise/enterprise.js")
[[ "${enterprise_js_headers,,}" == *"content-type: text/javascript"* ]]

for provider in anthropic openai xai gemini; do
  provider_headers=$(curl -fsSI "http://127.0.0.1:$port/providers/$provider.svg")
  [[ "${provider_headers,,}" == *"content-type: image/svg+xml"* ]]
done

terms_headers=$(curl -fsSI "http://127.0.0.1:$port/legal/terms-of-service")
[[ "$terms_headers" == *"200 OK"* ]]
[[ "${terms_headers,,}" == *"content-type: text/html"* ]]
[[ "${terms_headers,,}" == *"content-security-policy:"* ]]

privacy_headers=$(curl -fsSI "http://127.0.0.1:$port/legal/privacy-policy")
[[ "$privacy_headers" == *"200 OK"* ]]
[[ "${privacy_headers,,}" == *"content-type: text/html"* ]]

legal_css_headers=$(curl -fsSI "http://127.0.0.1:$port/legal/legal.css")
[[ "${legal_css_headers,,}" == *"content-type: text/css"* ]]

release_headers=$(curl -fsSI "http://127.0.0.1:$port/releases/vtest/fixture.tar.gz")
[[ "${release_headers,,}" == *"cache-control: public, max-age=31536000, immutable"* ]]
[[ "${release_headers,,}" == *"accept-ranges: bytes"* ]]

range_headers=$(curl -fsS -D - -o "$work/range" -H "Range: bytes=0-9" "http://127.0.0.1:$port/releases/vtest/fixture.tar.gz")
[[ "$range_headers" == *"206 Partial Content"* ]]
[[ $(wc -c < "$work/range") -eq 10 ]]

redirect_headers=$(curl -fsSI -H "Host: www.engiware.org" "http://127.0.0.1:$port/")
[[ "$redirect_headers" == *"308 Permanent Redirect"* ]]
[[ "${redirect_headers,,}" == *"location: http://engiware.org/"* ]]

method_status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$port/")
[[ "$method_status" == 405 ]]

printf '%s\n' 'Cloudflare Worker routing and R2 responses passed.'
