param(
  [int]$Port = 3000,
  [string]$HostName = '0.0.0.0'
)

$ErrorActionPreference = 'Stop'

if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535."
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  'C:\Users\14740\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

$env:NODE_ENV = 'production'
$env:PORT = "$Port"
$env:HOSTNAME = $HostName
$env:NOVA_TASK_DB = Join-Path $root 'data\nova-tasks.sqlite'
$env:NOVA_IMAGE_DIR = Join-Path $root 'data\nova-images'

Set-Location $root
Write-Host "Starting Nova Image on http://localhost:$Port..."
& $node 'backend\server.js'
