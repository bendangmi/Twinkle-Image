param(
  [string]$Platform = 'linux/amd64'
)

$ErrorActionPreference = 'Stop'

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $deployDir '..')
$version = (Get-Content (Join-Path $deployDir 'VERSION') -Raw).Trim()
$image = "twinkle-image:$version"
$archive = Join-Path $deployDir "twinkle-image-$version.tar"
$checksum = "$archive.sha256"

docker build --platform $Platform --build-arg "APP_VERSION=$version" --tag $image $rootDir
if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed.' }

docker save --output $archive $image
if ($LASTEXITCODE -ne 0) { throw 'Docker image export failed.' }

$hash = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $archive)" | Set-Content -Encoding ascii $checksum

Write-Host "Image:    $image"
Write-Host "Platform: $Platform"
Write-Host "Archive:  $archive"
Write-Host "Checksum: $checksum"
