Set-StrictMode -Version Latest

$script:DeployMarkerName = '.saa-sensor-selection-deploy-output.json'
$script:DeployProjectId = 'saa-sensor-selection-iis'

function Get-DeployFullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar)
}

function Test-SamePath([string]$Left, [string]$Right) {
  return [string]::Equals(
    (Get-DeployFullPath $Left),
    (Get-DeployFullPath $Right),
    [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-PathInside([string]$Candidate, [string]$Parent) {
  $candidateFull = Get-DeployFullPath $Candidate
  $parentFull = Get-DeployFullPath $Parent
  if (Test-SamePath $candidateFull $parentFull) { return $true }
  return $candidateFull.StartsWith(
    $parentFull + [System.IO.Path]::DirectorySeparatorChar,
    [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-DeployMarkerPath([string]$OutputPath) {
  return Join-Path $OutputPath $script:DeployMarkerName
}

function Assert-NoDeployReparseAncestor([string]$OutputPath) {
  $cursor = Get-DeployFullPath $OutputPath
  while (-not [string]::IsNullOrWhiteSpace($cursor)) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing deploy path through a junction or reparse point: $cursor"
      }
    }
    $parent = [System.IO.Directory]::GetParent($cursor)
    if ($null -eq $parent -or (Test-SamePath $parent.FullName $cursor)) { break }
    $cursor = $parent.FullName
  }
}

function Write-DeployOwnershipMarker([string]$OutputPath, [string]$FinalPath) {
  $payload = [ordered]@{
    schema = 1
    project = $script:DeployProjectId
    outputPath = Get-DeployFullPath $FinalPath
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText(
    (Get-DeployMarkerPath $OutputPath),
    $payload + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding $false))
}

function Assert-OwnedDeployOutput([string]$OutputPath) {
  $markerPath = Get-DeployMarkerPath $OutputPath
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw "Existing output is not owned by this deploy script: $OutputPath"
  }
  try {
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  }
  catch {
    throw "Deploy ownership marker is invalid: $markerPath"
  }
  if ($marker.schema -ne 1 -or $marker.project -ne $script:DeployProjectId) {
    throw "Deploy ownership marker does not match this project: $markerPath"
  }
  if (-not (Test-SamePath ([string]$marker.outputPath) $OutputPath)) {
    throw "Deploy ownership marker belongs to another path: $markerPath"
  }
  $dataPath = Join-Path $OutputPath 'App_Data'
  if (Test-Path -LiteralPath $dataPath) {
    throw "Refusing to replace output containing App_Data: $OutputPath"
  }
}

function Assert-SafeDeployTarget([string]$RepositoryRoot, [string]$OutputPath) {
  $repoFull = Get-DeployFullPath $RepositoryRoot
  $outputFull = Get-DeployFullPath $OutputPath
  Assert-NoDeployReparseAncestor $outputFull
  $outputRoot = [System.IO.Path]::GetPathRoot($outputFull)
  if ([string]::IsNullOrWhiteSpace($outputRoot) -or (Test-SamePath $outputFull $outputRoot)) {
    throw "Refusing to use a drive root as deploy output: $outputFull"
  }
  if (Test-SamePath $outputFull $repoFull -or (Test-PathInside $repoFull $outputFull)) {
    throw "Refusing to use the repository or its ancestor as deploy output: $outputFull"
  }
  if (Test-PathInside $outputFull $repoFull) {
    $deployRoot = Join-Path $repoFull 'deploy'
    if ((Test-SamePath $outputFull $deployRoot) -or -not (Test-PathInside $outputFull $deployRoot)) {
      throw "Repository-local deploy output must be a child of the deploy directory: $outputFull"
    }
  }
  foreach ($relative in @('frontend', 'backend', '.git', 'scripts')) {
    $protected = Join-Path $repoFull $relative
    if (Test-PathInside $outputFull $protected) {
      throw "Refusing to use a source directory as deploy output: $outputFull"
    }
  }
  if (Test-Path -LiteralPath $outputFull) {
    if (-not (Test-Path -LiteralPath $outputFull -PathType Container)) {
      throw "Deploy output exists and is not a directory: $outputFull"
    }
    Assert-OwnedDeployOutput $outputFull
  }
  return $outputFull
}

function Publish-OwnedDeployDirectory(
  [string]$StagingPath,
  [string]$OutputPath,
  [string]$RepositoryRoot) {
  $stagingFull = Get-DeployFullPath $StagingPath
  $outputFull = Assert-SafeDeployTarget $RepositoryRoot $OutputPath
  if (-not (Test-Path -LiteralPath $stagingFull -PathType Container)) {
    throw "Deploy staging directory does not exist: $stagingFull"
  }
  $parent = Split-Path -Parent $outputFull
  $leaf = Split-Path -Leaf $outputFull
  $previous = Join-Path $parent ('.' + $leaf + '.previous-' + [Guid]::NewGuid().ToString('N'))
  $movedPrevious = $false
  try {
    if (Test-Path -LiteralPath $outputFull) {
      Move-Item -LiteralPath $outputFull -Destination $previous
      $movedPrevious = $true
    }
    Move-Item -LiteralPath $stagingFull -Destination $outputFull
  }
  catch {
    if ($movedPrevious -and -not (Test-Path -LiteralPath $outputFull)) {
      Move-Item -LiteralPath $previous -Destination $outputFull
    }
    throw
  }
  if ($movedPrevious) {
    Remove-Item -LiteralPath $previous -Recurse -Force
  }
  return $outputFull
}
