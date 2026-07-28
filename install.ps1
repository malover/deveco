# DevEco Code Windows Binary Installer
# Downloads pre-built deveco binary from GitCode Releases
#
# Usage:
#   irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1))) -Version 0.1.4
#   & ([scriptblock]::Create((irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1))) -Baseline
#   & ([scriptblock]::Create((irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1))) -Binary C:\path\to\deveco.exe
#   & ([scriptblock]::Create((irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1))) -NoModifyPath

[CmdletBinding()]
param(
    [string]$Version = "",
    [switch]$Baseline,
    [string]$InstallDir = "$env:USERPROFILE\.deveco",
    [string]$Binary = "",
    [switch]$NoModifyPath,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# TLS 1.2 配置(PS 5.1 默认 TLS 1.0/1.1,GitCode HTTPS 需要 TLS 1.2)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 防止 PowerShell 5.1 的 Invoke-WebRequest 进度条显著拖慢大文件下载
$ProgressPreference = 'SilentlyContinue'

$gitcodeOwner = if ($env:GITCODE_OWNER) { $env:GITCODE_OWNER } else { "openharmony-sig" }
$gitcodeRepo = if ($env:GITCODE_REPO) { $env:GITCODE_REPO } else { "deveco-code" }
$Repo = "$gitcodeOwner/$gitcodeRepo"
$GitCodeApi = "https://gitcode.com/api/v5/repos/$Repo"
$AppName = "deveco"

function Show-Help {
    Write-Host "DevEco Code Windows Installer"
    Write-Host ""
    Write-Host "Usage: install.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Version <version>   Install a specific version (e.g., 0.1.4)"
    Write-Host "  -Baseline            Force baseline variant (no AVX2)"
    Write-Host "  -Binary <path>       Install from a local binary instead of downloading"
    Write-Host "  -InstallDir <path>   Install directory (default: `$env:USERPROFILE\.deveco)"
    Write-Host "  -NoModifyPath        Don't modify user PATH"
    Write-Host "  -Help                Show this help message"
    Write-Host ""
    Write-Host "Environment:"
    Write-Host "  GITCODE_OWNER        GitCode repo owner (default: openharmony-sig)"
    Write-Host "  GITCODE_REPO         GitCode repo name (default: deveco-code)"
    Write-Host "  VERSION              Version to install (overridden by -Version)"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1 | iex"
    Write-Host "  & ([scriptblock]::Create((irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1))) -Version 0.1.4"
    Write-Host "  & ([scriptblock]::Create((irm https://raw.gitcode.com/openharmony-sig/deveco-code/raw/develop/install.ps1))) -Binary C:\path\to\deveco.exe"
}

function Download-WithProgress {
    param([string]$Url, [string]$Output)
    # Try BITS first — native progress bar, doesn't slow downloads
    if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
        try {
            Start-BitsTransfer -Source $Url -Destination $Output -ErrorAction Stop
            return
        } catch {
            Write-Host "BITS transfer failed, falling back to Invoke-WebRequest" -ForegroundColor Yellow
        }
    }
    # Fallback: Invoke-WebRequest (progress disabled for PS 5.1 speed)
    Invoke-WebRequest -Uri $Url -OutFile $Output -UseBasicParsing
}

# L1: Use PID-suffixed class name to avoid same-session type conflicts
function Test-Avx2 {
    $className = "Avx2Check_$PID"
    $type = $className -as [type]
    if ($type) {
        return $type::IsProcessorFeaturePresent(40)
    }
    $sig = '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(int feature);'
    $type = Add-Type -MemberDefinition $sig -Name $className -PassThru
    return $type::IsProcessorFeaturePresent(40)
}

# M1: Check if the target version is already installed; exit 0 if so
function Test-InstalledVersion {
    param([string]$TargetVersion)
    $cmd = Get-Command deveco -ErrorAction SilentlyContinue
    if (-not $cmd) {
        $binPath = Join-Path $InstallDir "bin\$AppName.exe"
        if (Test-Path $binPath) { $cmd = $binPath }
    }
    if (-not $cmd) { return }
    try {
        $installed = (& $cmd --version 2>$null) -join "`n"
    } catch {
        return
    }
    $installed = $installed.Trim()
    if (-not $installed) { return }
    if ($installed -eq $TargetVersion) {
        Write-Host "Version $TargetVersion already installed, skipping" -ForegroundColor Cyan
        exit 0
    }
    Write-Host "Installed version: $installed." -ForegroundColor Cyan
}

if ($Help) {
    Show-Help
    exit 0
}

# --- Discover version (skipped when -Binary is provided) ---
if ($Binary) {
    if (-not (Test-Path $Binary)) {
        Write-Error "Binary not found: $Binary"
        Write-Host "Please check the path and try again" -ForegroundColor Yellow
        exit 1
    }
    $tag = "local"
} else {
    # 版本优先级: -Version 参数 > $env:VERSION 环境变量 > 自动探测最新
    $tag = if (-not [string]::IsNullOrWhiteSpace($Version)) {
        $Version -replace '^v', ''
    } elseif (-not [string]::IsNullOrWhiteSpace($env:VERSION)) {
        $env:VERSION -replace '^v', ''
    } else {
        ""
    }

    if ([string]::IsNullOrWhiteSpace($tag)) {
        Write-Host "Fetching latest version from GitCode..." -ForegroundColor Cyan
        try {
            $tagsUrl = "$GitCodeApi/tags?per_page=100"
            $tagsResponse = Invoke-RestMethod -Uri $tagsUrl -Method Get -ErrorAction Stop
            $tag = $tagsResponse.name |
                Where-Object { $_ -match '^v?\d+\.\d+\.\d+$' } |
                ForEach-Object { $_ -replace '^v', '' } |
                Sort-Object { [version]$_ } -Descending |
                Select-Object -First 1
            if ([string]::IsNullOrWhiteSpace($tag)) {
                throw "No valid version tags found"
            }
            Write-Host "Latest version: $tag" -ForegroundColor Green
        } catch {
            Write-Error "Failed to fetch version info from GitCode: $_"
            Write-Host "Hint: Use -Version 0.1.4 to specify a version manually." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "Using specified version: $tag" -ForegroundColor Cyan
        # Verify the release exists
        $releaseUrl = "$GitCodeApi/releases/v$tag"
        try {
            $response = Invoke-WebRequest -Uri $releaseUrl -Method Head -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
        } catch {
            Write-Error "Release v$tag not found: $_"
            Write-Host "Available releases: https://gitcode.com/$Repo/releases" -ForegroundColor Yellow
            exit 1
        }
    }

    # M1: Version skip check — only when NOT using -Binary
    Test-InstalledVersion $tag
}

# 全局 try/finally: 确保异常或 Ctrl+C 时清理 $tempFile 和 $tempDir
try {
    # --- Create install dir structure ---
    $binDir = Join-Path $InstallDir "bin"
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    }
    $devecoPath = Join-Path $binDir "$AppName.exe"

    if ($Binary) {
        # --- M3: Binary install — copy local binary, skip download/extract ---
        Write-Host "Installing deveco from: $Binary" -ForegroundColor Cyan
        if (Test-Path $devecoPath) { Remove-Item $devecoPath -Force }
        Copy-Item -Path $Binary -Destination $devecoPath -Force
    } else {
        # --- Determine baseline vs AVX2 ---
        $useBaseline = $Baseline
        if (-not $useBaseline) {
            $useBaseline = -not (Test-Avx2)
            if ($useBaseline) {
                Write-Host "AVX2 not detected — using baseline variant." -ForegroundColor Yellow
            } else {
                Write-Host "AVX2 detected — using standard variant." -ForegroundColor Green
            }
        }

        # --- Construct asset name and download URL ---
        $assetName = "deveco-windows-x64"
        if ($useBaseline) { $assetName += "-baseline" }
        $assetName += ".zip"

        # GitCode attach_files download endpoint (aligned with bash script)
        $downloadUrl = "$GitCodeApi/releases/v$tag/attach_files/$assetName/download"

        # --- Download to temp file ---
        Write-Host "Downloading: $downloadUrl" -ForegroundColor Cyan
        $tempFile = [System.IO.Path]::GetTempFileName() + ".zip"
        try {
            Download-WithProgress -Url $downloadUrl -Output $tempFile
        } catch {
            Write-Error "Download failed: $_"
            Write-Host "Try downloading manually: $downloadUrl" -ForegroundColor Yellow
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
            exit 1
        }

        # Verify download is not empty
        if (-not (Test-Path $tempFile) -or (Get-Item $tempFile).Length -eq 0) {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            Write-Error "Download failed — file is empty or missing"
            Write-Host "Check your network, or download manually from $downloadUrl" -ForegroundColor Yellow
            exit 1
        }

        # --- Extract to temp dir (not install dir — we search for files) ---
        $tempDir = Join-Path $env:TEMP "deveco_install_$PID"
        if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

        Write-Host "Extracting..." -ForegroundColor Cyan
        try {
            Expand-Archive -Path $tempFile -DestinationPath $tempDir -Force -ErrorAction Stop
        } catch {
            Write-Error "Extraction failed: $_"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
            exit 1
        } finally {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        }

        # --- Find binary: check .exe first on Windows (L2) ---
        $binarySrc = Join-Path $tempDir "$AppName.exe"
        if (-not (Test-Path $binarySrc)) {
            $binarySrc = Join-Path $tempDir $AppName
        }
        if (-not (Test-Path $binarySrc)) {
            $found = Get-ChildItem -Path $tempDir -Filter "$AppName.exe" -Recurse -File | Select-Object -First 1
            if (-not $found) {
                $found = Get-ChildItem -Path $tempDir -Filter $AppName -Recurse -File | Select-Object -First 1
            }
            if ($found) { $binarySrc = $found.FullName }
        }
        if (-not (Test-Path $binarySrc)) {
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Error "Binary '$AppName' not found in archive"
            Write-Host "The package may be corrupted — try downloading again" -ForegroundColor Yellow
            exit 1
        }

        # --- Move binary to bin dir, normalize name to deveco.exe ---
        if (Test-Path $devecoPath) { Remove-Item $devecoPath -Force }
        Move-Item -Path $binarySrc -Destination $devecoPath -Force

        # --- Copy vendor directory (ripgrep, mcp-bridge) — L4: file-by-file copy (aligned with bash cp -r || true) ---
        $vendorSrc = (Get-ChildItem -Path $tempDir -Filter "vendor" -Recurse -Directory | Select-Object -First 1)
        if ($vendorSrc) {
            $vendorDest = Join-Path $InstallDir "vendor"
            if (-not (Test-Path $vendorDest)) {
                New-Item -ItemType Directory -Path $vendorDest -Force | Out-Null
            }

            # 逐文件覆盖，锁定的文件跳过，不影响其他文件
            Get-ChildItem -Path $vendorSrc.FullName -Recurse -File | ForEach-Object {
                $relativePath = $_.FullName.Substring($vendorSrc.FullName.Length)
                $destFile = Join-Path $vendorDest $relativePath
                $destDir = Split-Path $destFile -Parent
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                try {
                    Copy-Item -Path $_.FullName -Destination $destFile -Force -ErrorAction Stop
                } catch {
                    Write-Host "  Skipped (in use): $relativePath" -ForegroundColor Yellow
                }
            }
            Write-Host "Copied vendor directory" -ForegroundColor Green
        }

        # --- Copy CHANGELOG.md (for /release-notes feature) ---
        $changelog = Get-ChildItem -Path $tempDir -Filter "CHANGELOG.md" -Recurse -File |
            Where-Object { $_.FullName -notmatch '\\bin\\' -and $_.FullName -notmatch '\\vendor\\' } |
            Select-Object -First 1
        if ($changelog) {
            Copy-Item -Path $changelog.FullName -Destination (Join-Path $InstallDir "CHANGELOG.md") -Force
            Write-Host "Copied CHANGELOG.md" -ForegroundColor Green
        }

        # Clean up temp dir
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    # --- Post-install smoke test (download mode only; -Binary skips per bash parity) ---
    if (-not $Binary) {
        # 改用退出码判断,更严谨(原写法对 NativeCommand 的 2>&1 可能产生 ErrorRecord 影响判断)
        & $devecoPath --version 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Remove-Item $devecoPath -Force -ErrorAction SilentlyContinue
            Write-Error "Installation verification failed — deveco could not run"
            Write-Host "Platform may be incompatible" -ForegroundColor Yellow
            exit 1
        }
    }

    # --- Add to user PATH (deduplicated, case-insensitive) — M2: -NoModifyPath ---
    if ($NoModifyPath) {
        Write-Host "Skipping PATH modification (-NoModifyPath)" -ForegroundColor Yellow
    } else {
        $pathEntry = $binDir
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
        # null 守卫: 防止新用户账户 PATH 为 null 时调用 TrimEnd 崩溃
        if (-not $currentPath) { $currentPath = "" }
        $pathEntries = $currentPath -split ";" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
        $alreadyInPath = $pathEntries | Where-Object { $_ -ieq $pathEntry }

        if ($alreadyInPath) {
            Write-Host "PATH already contains $pathEntry" -ForegroundColor Green
        } else {
            # L3: guard against empty PATH producing leading semicolon
            if ($currentPath) {
                $newPath = $currentPath.TrimEnd(";") + ";$pathEntry"
            } else {
                $newPath = $pathEntry
            }
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
            $env:Path += ";$pathEntry"
            Write-Host "Added $pathEntry to user PATH" -ForegroundColor Green
        }
    }

    # --- Success ---
    # For -Binary mode, skip --version (binary may lack vendor/ deps); use known tag instead
    if ($Binary) {
        $versionOutput = $tag
    } else {
        $versionOutput = & $devecoPath --version 2>&1
    }
    Write-Host ""
    Write-Host "▃▃▃▃  ▃▃▃▃ ▃   ▃ ▃▃▃▃  ▃▃▃   ▃▃▃     ▃▃▃   ▃▃▃  ▃▃▃▃  ▃▃▃▃" -ForegroundColor Green
    Write-Host "▃   ▃ ▃    ▃   ▃ ▃    ▃   ▃ ▃   ▃   ▃   ▃ ▃   ▃ ▃   ▃ ▃   " -ForegroundColor Green
    Write-Host "▄   ▄ ▄▄▄▄ ▄   ▄ ▄▄▄▄ ▄     ▄   ▄   ▄     ▄   ▄ ▄   ▄ ▄▄▄▄" -ForegroundColor Green
    Write-Host "▅   ▅ ▅    ▅   ▅ ▅    ▅   ▅ ▅   ▅   ▅   ▅ ▅   ▅ ▅   ▅ ▅   " -ForegroundColor Green
    Write-Host "▆▆▆▆  ▆▆▆▆  ▆▆▆  ▆▆▆▆  ▆▆▆   ▆▆▆     ▆▆▆   ▆▆▆  ▆▆▆▆  ▆▆▆▆" -ForegroundColor Green
    Write-Host ""
    if ($tag -eq "local") {
        Write-Host "Local binary installed." -ForegroundColor Green
    } else {
        Write-Host "DevEco Code v$tag installed successfully!" -ForegroundColor Green
    }
    Write-Host "  Version:  $versionOutput" -ForegroundColor White
    Write-Host "  Location: $devecoPath" -ForegroundColor White
    Write-Host "  Note: Open a new terminal for PATH changes to take effect." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Get started:" -ForegroundColor Cyan
    Write-Host "  cd <project>  # Open your project directory" -ForegroundColor White
    Write-Host "  deveco        # Launch DevEco Code" -ForegroundColor White
    Write-Host ""
} finally {
    # 全局清理: 确保异常或 Ctrl+C 时清理临时文件
    if ($tempFile -and (Test-Path $tempFile)) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
    if ($tempDir -and (Test-Path $tempDir)) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
