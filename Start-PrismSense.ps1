$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$runDir = Join-Path $root 'run'
$pythonVenv = Join-Path $backend '.venv\Scripts\python.exe'
$localSettings = Join-Path $backend 'config\local_secrets.py'
$exampleSettings = Join-Path $backend 'config\local_secrets.example.py'

function Stop-StartedProcesses {
    $targets = @(
        @{ File = (Join-Path $runDir 'backend.pid'); Marker = (Join-Path $backend 'manage.py') },
        @{ File = (Join-Path $runDir 'frontend.pid'); Marker = (Join-Path $frontend 'node_modules\vite\bin\vite.js') }
    )
    foreach ($target in $targets) {
        if (!(Test-Path -LiteralPath $target.File)) { continue }
        $rawPid = (Get-Content -LiteralPath $target.File -Raw).Trim()
        $processId = 0
        if ([int]::TryParse($rawPid, [ref]$processId) -and $processId -gt 0) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
            if ($proc -and $proc.CommandLine -and $proc.CommandLine.IndexOf($target.Marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            }
        }
        Remove-Item -LiteralPath $target.File -Force -ErrorAction SilentlyContinue
    }
}

function Get-NodeVersion {
    $value = (& node -p 'process.versions.node' 2>$null)
    if ($LASTEXITCODE -ne 0 -or !$value) { return $null }
    try { return [version]$value.Trim() } catch { return $null }
}

Write-Host 'PrismSense quick start' -ForegroundColor Cyan
Write-Host 'Checking Python and Node.js...'
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (!$pythonCommand) {
    throw 'Python was not found. Install Python 3.11 or newer, enable “Add Python to PATH”, then run this launcher again.'
}
$pythonVersion = & $pythonCommand.Source --version 2>&1
if ($pythonVersion -notmatch 'Python 3\.(1[1-9]|[2-9]\d)') {
    throw "Python 3.11 or newer is required. Found: $pythonVersion"
}
if (!(Get-Command node -ErrorAction SilentlyContinue) -or !(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'Node.js and npm were not found. Install the current Node.js LTS release, then close and reopen PowerShell.'
}
$nodeVersion = Get-NodeVersion
if (!$nodeVersion -or !(($nodeVersion.Major -eq 20 -and $nodeVersion -ge [version]'20.19') -or ($nodeVersion.Major -ge 22 -and $nodeVersion -ge [version]'22.12'))) {
    throw "Node.js 20.19+ or 22.12+ is required by the frontend. Found: $nodeVersion"
}

if (!(Test-Path -LiteralPath $pythonVenv)) {
    Write-Host 'Creating the project Python environment...'
    & $pythonCommand.Source -m venv (Join-Path $backend '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the project Python environment.' }
}
Write-Host 'Preparing the backend packages...'
& $pythonVenv -m pip install --disable-pip-version-check -r (Join-Path $backend 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed. Check your internet connection and try again.' }

if (!(Test-Path -LiteralPath $localSettings)) {
    Copy-Item -LiteralPath $exampleSettings -Destination $localSettings
    Write-Host 'Created your private OpenRouter settings file.' -ForegroundColor Green
}
$settingsText = Get-Content -LiteralPath $localSettings -Raw
$keyMatch = [regex]::Match($settingsText, '(?m)^\s*OPENROUTER_API_KEY\s*=\s*["'']([^"'']*)["'']')
$hasSavedKey = $keyMatch.Success -and $keyMatch.Groups[1].Value.Trim()
if ($hasSavedKey) {
    Write-Host 'An OpenRouter key is already saved locally. Enter your newly rotated key to replace it, or press Enter to keep the saved key.' -ForegroundColor Yellow
    $keyPrompt = 'New OpenRouter inference key (Enter keeps current)'
} else {
    Write-Host 'OpenRouter key is needed for cloud model answers; it will be saved only in backend/config/local_secrets.py.' -ForegroundColor Yellow
    $keyPrompt = 'Paste a newly rotated OpenRouter inference key (press Enter to configure this later)'
}
$secureKey = Read-Host $keyPrompt -AsSecureString
$pointer = [IntPtr]::Zero
try {
    if ($secureKey.Length -gt 0) {
        try {
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
            $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            if ($apiKey -notmatch '^sk-or-v1-[A-Za-z0-9_-]+$') {
                throw 'That does not look like an OpenRouter inference key. The project file was left unchanged.'
            }
            $replacement = 'OPENROUTER_API_KEY = "' + $apiKey + '"'
            if ($keyMatch.Success) {
                $settingsText = [regex]::Replace($settingsText, '(?m)^\s*OPENROUTER_API_KEY\s*=\s*[^\r\n]*', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, [System.Text.RegularExpressions.RegexOptions]::Multiline)
            } else {
                $settingsText = $settingsText.TrimEnd() + "`r`n" + $replacement + "`r`n"
            }
            [System.IO.File]::WriteAllText($localSettings, $settingsText, [System.Text.UTF8Encoding]::new($false))
            Write-Host 'OpenRouter key saved privately. Its value was not displayed.' -ForegroundColor Green
            Remove-Variable apiKey -ErrorAction SilentlyContinue
        } finally {
            if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        }
    }
} finally {
    $secureKey.Dispose()
}

if (!(Test-Path -LiteralPath (Join-Path $frontend 'node_modules\vite\bin\vite.js'))) {
    Write-Host 'Installing the frontend packages (first run only)...'
    Push-Location $frontend
    try {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed. Check your internet connection and try again.' }
    } finally { Pop-Location }
}

New-Item -ItemType Directory -Path $runDir -Force | Out-Null
Stop-StartedProcesses
foreach ($port in @(8000, 5173)) {
    $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($inUse) { throw "Port $port is already in use. Close the other app on that port, then run Stop-PrismSense.bat and try again." }
}

$pythonLog = Join-Path $runDir 'backend.log'
$pythonErrorLog = Join-Path $runDir 'backend-error.log'
$viteLog = Join-Path $runDir 'frontend.log'
$viteErrorLog = Join-Path $runDir 'frontend-error.log'
$manageScript = Join-Path $backend 'manage.py'
$backendArgs = '"{0}" runserver 127.0.0.1:8000 --noreload' -f $manageScript
$backendProcess = Start-Process -FilePath $pythonVenv -ArgumentList $backendArgs -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput $pythonLog -RedirectStandardError $pythonErrorLog -PassThru
Set-Content -LiteralPath (Join-Path $runDir 'backend.pid') -Value $backendProcess.Id -NoNewline
$nodePath = (Get-Command node).Source
$viteScript = Join-Path $frontend 'node_modules\vite\bin\vite.js'
$viteArgs = '"{0}" --host 127.0.0.1 --port 5173 --strictPort' -f $viteScript
$frontendProcess = Start-Process -FilePath $nodePath -ArgumentList $viteArgs -WorkingDirectory $frontend -WindowStyle Hidden -RedirectStandardOutput $viteLog -RedirectStandardError $viteErrorLog -PassThru
Set-Content -LiteralPath (Join-Path $runDir 'frontend.pid') -Value $frontendProcess.Id -NoNewline

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health/' -TimeoutSec 2
        $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2 -UseBasicParsing
        $ready = $true
        break
    } catch {
        if ($backendProcess.HasExited -or $frontendProcess.HasExited) { break }
    }
}
if (!$ready) {
    Stop-StartedProcesses
    Write-Host 'PrismSense did not finish starting. Recent backend and frontend logs:' -ForegroundColor Red
    foreach ($log in @($pythonErrorLog, $pythonLog, $viteErrorLog, $viteLog)) {
        if (Test-Path -LiteralPath $log) { Write-Host "--- $([IO.Path]::GetFileName($log)) ---"; Get-Content -LiteralPath $log -Tail 12 }
    }
    throw 'Startup failed. Fix the error shown above and launch again.'
}

Write-Host 'PrismSense is running at http://127.0.0.1:5173' -ForegroundColor Green
Write-Host 'Use Stop-PrismSense.bat when you are done. Logs are in the run folder.'
Start-Process 'http://127.0.0.1:5173'
