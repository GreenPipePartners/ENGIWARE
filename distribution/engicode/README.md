# EngiCode Distribution

EngiCode is distributed as a native Linux application bundle. The archive contains the compiled
EngiCode TUI, a relocatable CPython 3.12 runtime, and the PLC, Ignition, Engibook, Panel, and
Schematics review packages. It does not deliver a virtual-machine image, Docker image, Bun, Node,
`uv`, or a target-system Python dependency.

## Linux And Ubuntu

Publish `install.sh` at the deployment URL and attach the generated archives plus `SHA256SUMS` to
each `v<version>` release. A public installation then becomes:

```sh
curl -fsSL https://engiware.org/install | bash
engiware
```

The installer supports pinned versions and non-root user prefixes:

```sh
curl -fsSL https://engiware.org/install | bash -s -- --version 1.0.0
curl -fsSL https://engiware.org/install | ENGICODE_PREFIX="$HOME/.local" bash
```

By default, root installs under `/usr/local`; other users install under `$HOME/.local`. Downloads
come from `https://engiware.org/releases` unless `ENGICODE_REPOSITORY` or
`ENGICODE_RELEASE_BASE_URL` points to another release host.

## Project Prompt Journals

After an engineering source is loaded, Engiware records each admitted prompt in one UTC-dated
Markdown file beside that source:

```text
Logs/
└── Prompts/
    └── 2026-08-16.md
```

Each entry records the prompt, first assistant response, final assistant response, session and
prompt identities, and the provider/model used for the initial and final responses. Engiware owns
only the marked entry blocks and preserves other text in the daily file. The dated files appear as
selectable nodes at the bottom of the engineering project tree.

Engibook remains the immutable snapshot/review boundary. Prompt journals are mutable project
context that can be included in a later Engibook snapshot; loading an L5X does not automatically
create an Engibook.

## Engiware Configuration

Engiware loads configuration from `~/.config/engiware/config.json`, then the loaded engineering
project's `.engiware/config.json`, then the file named by `ENGIWARE_CONFIG`. Later sources override
earlier ones. Divider defaults are:

```json
{
  "keybinds": {
    "dividerUp": "ctrl+up",
    "dividerDown": "ctrl+down"
  },
  "layout": {
    "workspacePercent": 75,
    "dividerStep": 5
  }
}
```

`dividerUp` moves the workspace/prompt divider upward and gives the prompt area more room;
`dividerDown` moves it downward. The workspace is clamped between 30% and 80% of the available
height.

## Windows, Winghostty, And PowerShell

The supported Windows runtime is Ubuntu 24.04 under WSL2, displayed through
[Winghostty](https://winghostty.com/). Winghostty requires Windows 10 or 11 and an OpenGL 4.3+
graphics driver. Run from PowerShell:

```powershell
irm https://engiware.org/install.ps1 | iex
engiware
```

For the standard Windows experience, download `https://engiware.org/EngiCodeSetup.exe`. The native
web installer requests elevation, provisions the same components, schedules itself through
`RunOnce` when Windows must restart, resumes automatically after sign-in, and creates an EngiCode
Start-menu shortcut. Build the versioned x64 executable on Linux with Zig and ImageMagick:

```sh
distribution/engicode/build-windows-installer.sh --version 1.0.0
```

If WSL2 or Ubuntu is absent, an elevated PowerShell session provisions it. A required Windows
restart is reported with exit code `3010`; run the installer again after restart. The installer
places EngiCode inside WSL, installs Winghostty through
`winget install AmanThanvi.winghostty`, and creates `%LOCALAPPDATA%\EngiCode\bin\engiware.cmd`.
Running `engiware` from PowerShell opens a dedicated Winghostty window executing EngiCode inside
the selected WSL distribution. `engiware-cli` is also installed for noninteractive commands that
should stay in the current PowerShell window, such as `engiware-cli --version`. The former
`engicode` and `engicode-cli` commands remain compatibility aliases.

Winghostty currently uses a self-signed Authenticode certificate, so Windows may show a SmartScreen
warning. Its WinGet package and release checksums come from the Winghostty project; review
[its installation guidance](https://winghostty.com/) before deployment through managed Windows
policy.

The `engiware.org` static host must publish `install`, `install.ps1`,
`EngiCodeSetup.exe`, `releases/latest/version`, and each versioned artifact under
`releases/v<version>/`. For private
deployments, mirror the same layout on an authenticated internal HTTPS endpoint and set
`ENGICODE_RELEASE_BASE_URL`.

Generate that complete static tree after building a release:

```sh
distribution/engicode/stage-site.sh --version 1.0.0
```

Deploy the contents of `dist/engicode-site/` at the root of `https://engiware.org`. This directory
is suitable for Cloudflare Pages/R2, S3, or another static HTTPS host. Cache
`releases/v<version>/*` immutably; do not apply long-lived caching to `install`, `install.ps1`, or
`releases/latest/version`.

### Cloudflare Worker And R2

The Cloudflare deployment stores the staged tree in the `engicode-site` R2 bucket and serves it
through a Worker with range requests, conditional requests, immutable release caching, security
headers, and canonical `www` redirects.

Authenticate and deploy a preview:

```sh
cd packages/www
bunx wrangler login
cd ../..
distribution/engicode/cloudflare/deploy.sh --version 1.0.0
```

After adding `engiware.org` to the same Cloudflare account and activating its assigned nameservers,
deploy the custom domains:

```sh
distribution/engicode/cloudflare/deploy.sh --version 1.0.0 --production
```

Pass `--source <artifact-directory>` when the release files are outside the default
`dist/engicode/` directory.

Verify Worker behavior locally with:

```sh
distribution/engicode/cloudflare/test.sh
```

## Building

Build on the oldest supported Ubuntu release for ABI compatibility. The current product source is
split across sibling Engiware and Flux workspaces, so the release runner must provide this layout:

```text
<workspace>/10018-GPP-Engiware/opencode
<workspace>/10018-GPP-Engiware/engibook
<workspace>/10018-GPP-Engiware/engibook-host
<workspace>/100107-GPP-Ignition
<workspace>/100104-GPP-plc
<workspace>/100105-GPP-panel
<workspace>/100106-GPP-schematics
<workspace>/100101-GPP-flux_deep_plc
<workspace>/100102-GPP-flux_deep_schematics
<workspace>/10010-GPP-Flux/mine
<workspace>/10010-GPP-Flux/panel
```

Then run:

```sh
cd <workspace>/10018-GPP-Engiware/opencode
distribution/engicode/build.sh --version 1.0.0
```

For a deployable Ubuntu artifact regardless of the developer workstation OS, use the Dockerized
builder instead:

```sh
distribution/engicode/build-ubuntu.sh --version 1.0.0
```

On x64 this creates:

```text
dist/engicode/engicode-linux-x64.tar.gz
dist/engicode/engicode-linux-x64-baseline.tar.gz
dist/engicode/SHA256SUMS
```

An arm64 Linux runner creates `engicode-linux-arm64.tar.gz`. The x64 baseline archive supports
VM CPUs without AVX2. The build must run on Ubuntu rather than reusing an Arch-built CLI because
the native OpenTUI dependency links against the build system's glibc and ICU ABI.

`.github/workflows/release-engicode.yml` runs the Ubuntu builder and can publish these files from a
self-hosted runner labeled `engicode-builder`. Set the repository variable
`ENGICODE_WORKSPACE_ROOT` to the absolute source workspace shown above. A self-hosted runner is
currently required because several engineering adapter projects are local source distributions,
not independently reproducible repository checkouts.

## Verification

Run the installer contract test with:

```sh
distribution/engicode/test-install.sh
```

After building a real archive, install it into an isolated prefix:

```sh
distribution/engicode/install.sh \
  --artifact dist/engicode/engicode-linux-x64.tar.gz \
  --checksum dist/engicode/SHA256SUMS \
  --prefix /tmp/engicode-install

/tmp/engicode-install/bin/engiware --version
distribution/engicode/verify-install.sh /tmp/engicode-install
```
