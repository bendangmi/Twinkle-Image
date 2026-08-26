param(
  [string]$Platform = 'linux/amd64',
  [switch]$NoVersionBump,
  [string]$Version,
  [string]$DebianMirror = 'mirrors.aliyun.com'
)

$ErrorActionPreference = 'Stop'

$deployDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootDir = [System.IO.Path]::GetFullPath((Join-Path $deployDir '..'))
$versionPath = Join-Path $deployDir 'VERSION'
$currentVersion = ([System.IO.File]::ReadAllText($versionPath)).Trim()
$semverPattern = '^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'

function Assert-Semver([string]$Value) {
  if ($Value -notmatch $semverPattern) {
    throw "Invalid semantic version '$Value'. Expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-PRERELEASE."
  }
}

if ($currentVersion -notmatch $semverPattern) {
  throw "Invalid semantic version '$currentVersion'. Expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-PRERELEASE."
}
$currentParts = $Matches.Clone()

if ($Version) {
  Assert-Semver $Version
  $targetVersion = $Version
} elseif ($NoVersionBump) {
  $targetVersion = $currentVersion
} else {
  $targetVersion = '{0}.{1}.{2}' -f $currentParts.major, $currentParts.minor, ([int]$currentParts.patch + 1)
}

$image = "twinkle-image:$targetVersion"
$archive = Join-Path $deployDir "twinkle-image-$targetVersion.tar"
$checksum = "$archive.sha256"
$archiveExisted = Test-Path -LiteralPath $archive
$originals = @{}

function Read-TrackedText([string]$Path) {
  if (-not $originals.ContainsKey($Path)) {
    $originals[$Path] = [System.IO.File]::ReadAllText($Path)
  }
  return [System.IO.File]::ReadAllText($Path)
}

function Write-TrackedText([string]$Path, [string]$Content) {
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Update-Text([string]$Path, [string]$Old, [string]$New) {
  $content = Read-TrackedText $Path
  $updated = $content.Replace($Old, $New)
  if ($updated -eq $content) {
    throw "Could not update '$Path': version '$Old' was not found."
  }
  Write-TrackedText $Path $updated
}

function Update-ProjectJsonVersion([string]$Path, [string]$Old, [string]$New) {
  $content = Read-TrackedText $Path
  $escapedOld = [regex]::Escape($Old)
  $replacement = '${1}' + $New + '${2}'
  $rootPattern = '(?ms)\A(\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")' + $escapedOld + '(")'
  $updated = [regex]::Replace($content, $rootPattern, $replacement, 1)

  if ($Path -match 'package-lock\.json$') {
    $workspacePattern = '(?ms)("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")' + $escapedOld + '(")'
    $updated = [regex]::Replace($updated, $workspacePattern, $replacement, 1)
  }

  if ($updated -eq $content) {
    throw "Could not update project version in '$Path'."
  }
  Write-TrackedText $Path $updated
}

function Restore-TrackedFiles {
  foreach ($entry in $originals.GetEnumerator()) {
    Write-TrackedText $entry.Key $entry.Value
  }
}

$versionChanged = $targetVersion -ne $currentVersion

try {
  if ($versionChanged) {
    $projectJsonFiles = @(
      (Join-Path $rootDir 'package.json'),
      (Join-Path $rootDir 'package-lock.json'),
      (Join-Path $rootDir 'backend/package.json'),
      (Join-Path $rootDir 'backend/package-lock.json'),
      (Join-Path $rootDir 'frontend/package.json'),
      (Join-Path $rootDir 'frontend/package-lock.json')
    )
    foreach ($path in $projectJsonFiles) {
      Update-ProjectJsonVersion $path $currentVersion $targetVersion
    }

    Update-Text (Join-Path $rootDir 'Dockerfile') "ARG APP_VERSION=$currentVersion" "ARG APP_VERSION=$targetVersion"
    Update-Text (Join-Path $rootDir 'docker-compose.yml') "twinkle-image:$currentVersion" "twinkle-image:$targetVersion"
    Update-Text (Join-Path $deployDir 'docker-compose.yaml') "twinkle-image:$currentVersion" "twinkle-image:$targetVersion"
    Update-Text $versionPath $currentVersion $targetVersion
    Update-Text (Join-Path $deployDir 'DEPLOY.md') $currentVersion $targetVersion
    Update-Text (Join-Path $rootDir 'README.md') $currentVersion $targetVersion
    Update-Text (Join-Path $rootDir 'README_ZH_CN.md') $currentVersion $targetVersion
    Update-Text (Join-Path $rootDir '本地启动与镜像打包教程.md') $currentVersion $targetVersion
  }

  Write-Host "Version:  $currentVersion -> $targetVersion"
  Write-Host "Building: $image ($Platform)"

  docker build --platform $Platform --build-arg "APP_VERSION=$targetVersion" --build-arg "DEBIAN_MIRROR=$DebianMirror" --tag $image $rootDir
  if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed.' }

  docker save --output $archive $image
  if ($LASTEXITCODE -ne 0) { throw 'Docker image export failed.' }

  $imageDetails = docker image inspect $image | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Docker image inspection failed.' }
  $labelVersion = $imageDetails[0].Config.Labels.'org.opencontainers.image.version'
  if ($labelVersion -ne $targetVersion) {
    throw "Image label version mismatch: expected '$targetVersion', got '$labelVersion'."
  }

  $hash = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
  "$hash  $(Split-Path -Leaf $archive)" | Set-Content -Encoding ascii $checksum

  Write-Host "Image:    $image"
  Write-Host "Platform: $Platform"
  Write-Host "Archive:  $archive"
  Write-Host "Checksum: $checksum"
} catch {
  if ($versionChanged) {
    Restore-TrackedFiles
    Write-Warning "Build failed; restored project version '$currentVersion'."
  }
  if (-not $archiveExisted) {
    Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  }
  throw
}
