$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  'C:\Users\14740\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

$env:NODE_ENV = 'production'
$env:NOVA_TASK_DB = Join-Path $root 'data\nova-tasks.sqlite'
$env:NOVA_IMAGE_DIR = Join-Path $root 'data\nova-images'

Set-Location $root
& $node 'backend\server.js'
