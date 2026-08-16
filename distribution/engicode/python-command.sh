#!/usr/bin/env bash
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)
command_name=$(basename -- "$0")

case "$command_name" in
  flux-deep-domain-host) entry="flux_deep.domain_host:main" ;;
  engiware-ignition-domain-host) entry="engiware_ignition.domain_host:main" ;;
  engiware-engibook-domain-host) entry="engiware_engibook_host.host:main" ;;
  engiware-plc-engibook) entry="engiware_plc.adapter:main" ;;
  engiware-ignition-engibook) entry="engiware_ignition.engibook_adapter:main" ;;
  engiware-panel-engibook) entry="engiware_panel.adapter:main" ;;
  engiware-schematics-engibook) entry="engiware_schematics.adapter:main" ;;
  flux-deep) entry="flux_deep.cli:main" ;;
  flux-mine) entry="flux_mine.cli:main" ;;
  flux-schematics) entry="flux_schematics.cli:main" ;;
  *)
    printf 'Unknown EngiCode runtime command: %s\n' "$command_name" >&2
    exit 64
    ;;
esac

export PYTHONPATH="$root/lib/python${PYTHONPATH:+:$PYTHONPATH}"
exec "$root/runtime/python/bin/python3" -c \
  'import importlib, sys; module, name = sys.argv.pop(1).split(":", 1); sys.argv[0] = sys.argv.pop(1); raise SystemExit(getattr(importlib.import_module(module), name)())' \
  "$entry" "$command_name" "$@"
