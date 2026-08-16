[CmdletBinding()]
param(
    [string]$Version = $env:ENGICODE_VERSION,
    [string]$Distribution = $(if ($env:ENGICODE_WSL_DISTRIBUTION) { $env:ENGICODE_WSL_DISTRIBUTION } else { "Ubuntu-24.04" }),
    [string]$Repository = $(if ($env:ENGICODE_REPOSITORY) { $env:ENGICODE_REPOSITORY } else { "GreenPipePartners/ENGIWARE" }),
    [string]$ReleaseBaseUrl = $(if ($env:ENGICODE_RELEASE_BASE_URL) { $env:ENGICODE_RELEASE_BASE_URL } else { "https://engiware.org/releases" }),
    [string]$LinuxInstallerUrl = $(if ($env:ENGICODE_LINUX_INSTALLER_URL) { $env:ENGICODE_LINUX_INSTALLER_URL } else { "https://engiware.org/install" })
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Quote-Bash([string]$Value) {
    $singleQuote = [string][char]39
    $replacement = $singleQuote + '"' + $singleQuote + '"' + $singleQuote
    return $singleQuote + $Value.Replace($singleQuote, $replacement) + $singleQuote
}

function Find-Winghostty {
    $candidates = [System.Collections.Generic.List[string]]::new()
    $command = Get-Command winghostty.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates.Add($command.Source) }
    if ($env:ProgramFiles) { $candidates.Add((Join-Path $env:ProgramFiles "winghostty\winghostty.exe")) }
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\winghostty\winghostty.exe")) }
    if (${env:ProgramFiles(x86)}) { $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "winghostty\winghostty.exe")) }
    $uninstallRoots = @(
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($root in $uninstallRoots) {
        Get-ItemProperty $root -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq "winghostty" -and $_.InstallLocation } |
            ForEach-Object { $candidates.Add((Join-Path $_.InstallLocation "winghostty.exe")) }
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Test-WslReady {
    & "$env:SystemRoot\System32\cmd.exe" /d /c "wsl.exe --status >nul 2>&1"
    return $LASTEXITCODE -eq 0
}

if ($Version -and $Version -notmatch '^v?[0-9A-Za-z][0-9A-Za-z._+-]*$') {
    throw "Invalid EngiCode version: $Version"
}
if ($Distribution -notmatch '^[0-9A-Za-z._+-]+$') {
    throw "Invalid WSL distribution name: $Distribution"
}

$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wsl) {
    if (-not (Test-Administrator)) {
        throw "WSL2 is not installed. Re-run this installer from an elevated PowerShell terminal."
    }
    Write-Host "Enabling the Windows features required by WSL2..."
    Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart | Out-Null
    Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart | Out-Null
    Write-Host "Windows must restart before EngiCode installation can continue. Re-run this command after restart."
    exit 3010
}
$wslReady = Test-WslReady
if (-not $wslReady) {
    if (-not (Test-Administrator)) {
        throw "WSL2 is not ready. Re-run this installer from an elevated PowerShell terminal."
    }
    Write-Host "Installing WSL2 and $Distribution..."
    & wsl.exe --install --distribution $Distribution --no-launch
    if ($LASTEXITCODE -ne 0) { throw "WSL2 installation failed with exit code $LASTEXITCODE." }
    if (-not (Test-WslReady)) {
        Write-Host "Windows must restart before EngiCode installation can continue. Re-run this command after restart."
        exit 3010
    }
}

$installed = @(& wsl.exe --list --quiet 2>$null) | ForEach-Object { $_.Replace([string][char]0, '').Trim() } | Where-Object { $_ }
if ($installed -notcontains $Distribution) {
    if (-not (Test-Administrator)) {
        throw "$Distribution is not installed. Re-run this installer from an elevated PowerShell terminal."
    }
    Write-Host "Installing WSL distribution $Distribution..."
    & wsl.exe --install --distribution $Distribution --no-launch
    if ($LASTEXITCODE -ne 0) { throw "WSL distribution installation failed with exit code $LASTEXITCODE." }
}

& wsl.exe --distribution $Distribution --user root -- true
if ($LASTEXITCODE -ne 0) {
    Write-Host "Windows must restart before $Distribution can initialize. Re-run this command after restart."
    exit 3010
}

$arguments = @("--prefix", "/usr/local", "--repository", $Repository)
if ($Version) { $arguments += @("--version", $Version.TrimStart('v')) }
if ($ReleaseBaseUrl) { $arguments += @("--base-url", $ReleaseBaseUrl) }
$quotedArguments = ($arguments | ForEach-Object { Quote-Bash $_ }) -join " "
$command = "curl -fsSL $(Quote-Bash $LinuxInstallerUrl) | bash -s -- $quotedArguments"

Write-Host "Installing EngiCode in $Distribution..."
& wsl.exe --distribution $Distribution --user root -- bash -lc $command
if ($LASTEXITCODE -ne 0) { throw "EngiCode Linux installation failed with exit code $LASTEXITCODE." }

$winghostty = Find-Winghostty
if (-not $winghostty) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Winghostty is required. Install it from https://winghostty.com/ and run this installer again."
    }
    Write-Host "Installing Winghostty..."
    & winget.exe install --exact --id AmanThanvi.winghostty --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "Winghostty installation failed with exit code $LASTEXITCODE." }
    $winghostty = Find-Winghostty
    if (-not $winghostty) {
        throw "Winghostty was installed but winghostty.exe could not be located. See https://winghostty.com/."
    }
}

$bin = Join-Path $env:LOCALAPPDATA "EngiCode\bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$terminalWrapper = @"
@echo off
start "" "$winghostty" -e wsl.exe --distribution $Distribution -- engiware %*
"@
foreach ($name in @("engiware.cmd", "engicode.cmd")) {
    $terminalWrapper | Set-Content -Encoding Ascii -Path (Join-Path $bin $name)
}
$cliWrapper = @"
@echo off
wsl.exe --distribution $Distribution -- engiware %*
"@
foreach ($name in @("engiware-cli.cmd", "engicode-cli.cmd")) {
    $cliWrapper | Set-Content -Encoding Ascii -Path (Join-Path $bin $name)
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = @($userPath -split ';' | Where-Object { $_ })
if ($entries -notcontains $bin) {
    [Environment]::SetEnvironmentVariable("Path", (($entries + $bin) -join ';'), "User")
}
if (($env:Path -split ';') -notcontains $bin) {
    $env:Path = "$env:Path;$bin"
}

$installedVersion = & wsl.exe --distribution $Distribution -- engiware --version
if ($LASTEXITCODE -ne 0) { throw "EngiCode verification failed with exit code $LASTEXITCODE." }
Write-Host "Installed $installedVersion in $Distribution with Winghostty. Open a new PowerShell window and run: engiware"
