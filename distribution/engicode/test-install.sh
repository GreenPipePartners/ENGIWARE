#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/engicode-installer-test.XXXXXX")
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/payload/bin" "$work/payload/libexec" "$work/payload/runtime/python/bin"
cat > "$work/payload/bin/engicode" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'engicode v1.2.3-test'
EOF
cat > "$work/payload/libexec/engicode-core" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$work/payload/runtime/python/bin/python3" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod 755 "$work/payload/bin/engicode" "$work/payload/libexec/engicode-core" "$work/payload/runtime/python/bin/python3"
for command in engiware-plc-engibook engiware-ignition-engibook engiware-panel-engibook engiware-schematics-engibook flux-deep flux-mine flux-schematics; do
  ln -s engicode "$work/payload/bin/$command"
done
printf '%s\n' '1.2.3-test' > "$work/payload/VERSION"
tar -C "$work/payload" -czf "$work/engicode-linux-test.tar.gz" .
(
  cd "$work"
  sha256sum engicode-linux-test.tar.gz > SHA256SUMS
)

"$script_dir/install.sh" \
  --artifact "$work/engicode-linux-test.tar.gz" \
  --checksum "$work/SHA256SUMS" \
  --prefix "$work/prefix"

test -L "$work/prefix/bin/engicode"
test -L "$work/prefix/bin/engiware-panel-engibook"
test "$("$work/prefix/bin/engicode" --version)" = "engicode v1.2.3-test"
test -x "$work/prefix/lib/engicode/1.2.3-test/libexec/engicode-core"
printf '%s\n' 'EngiCode installer smoke test passed.'
