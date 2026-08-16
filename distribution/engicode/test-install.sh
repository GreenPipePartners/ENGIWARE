#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/engicode-installer-test.XXXXXX")
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/payload/bin" "$work/payload/libexec" "$work/payload/runtime/python/bin"
cat > "$work/payload/bin/engiware" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 'engiware v1.2.3-test'
EOF
ln -s engiware "$work/payload/bin/engicode"
cat > "$work/payload/libexec/engicode-core" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$work/payload/runtime/python/bin/python3" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod 755 "$work/payload/bin/engiware" "$work/payload/libexec/engicode-core" "$work/payload/runtime/python/bin/python3"
for command in engiware-plc-engibook engiware-ignition-engibook engiware-panel-engibook engiware-schematics-engibook flux-deep flux-mine flux-schematics; do
  ln -s engiware "$work/payload/bin/$command"
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

test -L "$work/prefix/bin/engiware"
test -L "$work/prefix/bin/engicode"
test -L "$work/prefix/bin/engiware-panel-engibook"
test "$("$work/prefix/bin/engiware" --version)" = "engiware v1.2.3-test"
test "$("$work/prefix/bin/engicode" --version)" = "engiware v1.2.3-test"
test "$(readlink -f -- "$work/prefix/bin/engiware")" = "$(readlink -f -- "$work/prefix/bin/engicode")"
test -x "$work/prefix/lib/engicode/1.2.3-test/libexec/engicode-core"

cp -a "$work/payload" "$work/legacy-payload"
rm "$work/legacy-payload/bin/engicode"
mv "$work/legacy-payload/bin/engiware" "$work/legacy-payload/bin/engicode"
for command in engiware-plc-engibook engiware-ignition-engibook engiware-panel-engibook engiware-schematics-engibook flux-deep flux-mine flux-schematics; do
  ln -sfn engicode "$work/legacy-payload/bin/$command"
done
sed -i 's/engiware v1.2.3-test/engicode v1.2.2-test/' "$work/legacy-payload/bin/engicode"
printf '%s\n' '1.2.2-test' > "$work/legacy-payload/VERSION"
tar -C "$work/legacy-payload" -czf "$work/engicode-linux-legacy.tar.gz" .
(
  cd "$work"
  sha256sum engicode-linux-legacy.tar.gz > LEGACY-SHA256SUMS
)
"$script_dir/install.sh" \
  --artifact "$work/engicode-linux-legacy.tar.gz" \
  --checksum "$work/LEGACY-SHA256SUMS" \
  --prefix "$work/legacy-prefix" \
  >/dev/null
test "$("$work/legacy-prefix/bin/engiware" --version)" = "engicode v1.2.2-test"
test "$("$work/legacy-prefix/bin/engicode" --version)" = "engicode v1.2.2-test"
printf '%s\n' 'EngiCode installer smoke test passed.'
