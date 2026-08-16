#!/usr/bin/env bash
set -euo pipefail

prefix=${1:-}
if [[ -z "$prefix" || ! -x "$prefix/bin/engicode" ]]; then
  printf 'Usage: verify-install.sh <installed-prefix>\n' >&2
  exit 64
fi

version=$($prefix/bin/engicode --version)
case "$version" in
  'engicode v'*) ;;
  *)
    printf 'Unexpected EngiCode version output: %s\n' "$version" >&2
    exit 65
    ;;
esac

payload=$(readlink -f -- "$prefix/bin/engicode")
payload=$(CDPATH= cd -- "$(dirname -- "$payload")/.." && pwd)
request='{"id":"smoke","method":"host.hello","params":{"protocolVersion":1}}'
for host in flux-deep-domain-host engiware-ignition-domain-host engiware-engibook-domain-host; do
  response=$(printf '%s\n' "$request" | "$payload/libexec/$host")
  if [[ "$response" != *'"protocolVersion":1'* || "$response" != *'"id":"smoke"'* ]]; then
    printf 'EngiCode host smoke test failed for %s:\n%s\n' "$host" "$response" >&2
    exit 70
  fi
done

for command in engiware-plc-engibook engiware-ignition-engibook engiware-panel-engibook engiware-schematics-engibook; do
  "$prefix/bin/$command" --help >/dev/null
done

printf 'Verified %s and all bundled engineering hosts.\n' "$version"
