param(
  [int]$FrontendPort = 3100,
  [int]$BackendPort = 3101,
  [string]$HostName = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'

if ($FrontendPort -lt 1 -or $FrontendPort -gt 65535) {
  throw "FrontendPort must be between 1 and 65535."
}
if ($BackendPort -lt 1 -or $BackendPort -gt 65535) {
  throw "BackendPort must be between 1 and 65535."
}
if ($FrontendPort -eq $BackendPort) {
  throw "FrontendPort and BackendPort must be different."
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  'C:\Users\14740\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$nextCli = Join-Path $root 'frontend\node_modules\next\dist\bin\next'

function Assert-PortAvailable([int]$Port, [string]$Name) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    throw "$Name port $Port is already in use by process $($listener.OwningProcess). Choose another port."
  }
}

Assert-PortAvailable $FrontendPort 'Frontend'
Assert-PortAvailable $BackendPort 'Backend'

$backendUrl = "http://localhost:$BackendPort"
$backendOutput = Join-Path $root "local-backend-$BackendPort.out.log"
$backendError = Join-Path $root "local-backend-$BackendPort.err.log"
$frontendOutput = Join-Path $root "local-frontend-$FrontendPort.out.log"
$frontendError = Join-Path $root "local-frontend-$FrontendPort.err.log"

$env:NODE_ENV = 'production'
$env:PORT = "$BackendPort"
$env:HOSTNAME = $HostName
$env:NOVA_TASK_DB = Join-Path $root 'data\nova-tasks.sqlite'
$env:NOVA_IMAGE_DIR = Join-Path $root 'data\nova-images'

$backendProcess = Start-Process -FilePath $node -ArgumentList @('backend\server.js') -WorkingDirectory $root -RedirectStandardOutput $backendOutput -RedirectStandardError $backendError -PassThru

try {
  $env:NODE_ENV = 'development'
  $env:PORT = "$FrontendPort"
  $env:NOVA_BACKEND_URL = $backendUrl
  $env:NEXT_PUBLIC_BACKEND_URL = $backendUrl

  if (Test-Path $nextCli) {
    $frontendProcess = Start-Process -FilePath $node -ArgumentList @($nextCli, 'dev', '--webpack', '--hostname', $HostName, '--port', "$FrontendPort") -WorkingDirectory (Join-Path $root 'frontend') -RedirectStandardOutput $frontendOutput -RedirectStandardError $frontendError -PassThru
  } else {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    $npm = if ($npmCommand) { $npmCommand.Source } else { 'npm.cmd' }
    $frontendProcess = Start-Process -FilePath $npm -ArgumentList @('run', 'dev', '--', '--hostname', $HostName, '--port', "$FrontendPort") -WorkingDirectory (Join-Path $root 'frontend') -RedirectStandardOutput $frontendOutput -RedirectStandardError $frontendError -PassThru
  }
} catch {
  Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
  throw
}

Write-Host 'Nova Image local development servers started.'
Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "Backend:  $backendUrl" -ForegroundColor Green
Write-Host "Frontend PID: $($frontendProcess.Id)"
Write-Host "Backend PID:  $($backendProcess.Id)"
Write-Host "Logs: $frontendOutput / $frontendError"
Write-Host "      $backendOutput / $backendError"
Write-Host ''
Write-Host 'Stop with: Stop-Process -Id <Frontend PID>, <Backend PID>'
