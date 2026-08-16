#!/usr/bin/env bash
set -euo pipefail

root=$(CDPATH= cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/.." && pwd)
python_path="$root/lib/python"

export PYTHONPATH="$python_path${PYTHONPATH:+:$PYTHONPATH}"
export OPENCODE_DISABLE_AUTOUPDATE="${OPENCODE_DISABLE_AUTOUPDATE:-1}"
export ENGIWARE_PLC_DOMAIN_HOST_COMMAND="${ENGIWARE_PLC_DOMAIN_HOST_COMMAND:-[\"$root/libexec/flux-deep-domain-host\"]}"
export ENGIWARE_IGNITION_DOMAIN_HOST_COMMAND="${ENGIWARE_IGNITION_DOMAIN_HOST_COMMAND:-[\"$root/libexec/engiware-ignition-domain-host\"]}"
export ENGIWARE_ENGIBOOK_HOST_COMMAND="${ENGIWARE_ENGIBOOK_HOST_COMMAND:-[\"$root/libexec/engiware-engibook-domain-host\"]}"

exec "$root/libexec/engicode-core" "$@"
