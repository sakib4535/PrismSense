$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runDir = Join-Path $root 'run'
$backendMarker = Join-Path $root 'backend\manage.py'
$frontendMarker = Join-Path $root 'frontend\node_modules\vite\bin\vite.js'

$targets = @(
    @{ File = (Join-Path $runDir 'backend.pid'); Marker = $backendMarker },
    @{ File = (Join-Path $runDir 'frontend.pid'); Marker = $frontendMarker }
)
$stopped = 0
foreach ($target in $targets) {
    if (!(Test-Path -LiteralPath $target.File)) { continue }
    $rawPid = (Get-Content -LiteralPath $target.File -Raw).Trim()
    $processId = 0
    if ([int]::TryParse($rawPid, [ref]$processId) -and $processId -gt 0) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
        if ($proc -and $proc.CommandLine -and $proc.CommandLine.IndexOf($target.Marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            $stopped++
        }
    }
    Remove-Item -LiteralPath $target.File -Force -ErrorAction SilentlyContinue
}
if ($stopped) { Write-Host 'PrismSense stopped.' -ForegroundColor Green }
else { Write-Host 'PrismSense was not running.' }
