$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'deploy-iis-paths.ps1')

function Assert-Throws([scriptblock]$Action, [string]$Label) {
  try { & $Action }
  catch { return }
  throw "Expected rejection: $Label"
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('saa-deploy-path-test-' + [Guid]::NewGuid().ToString('N'))
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith([System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()))) {
  throw "Unexpected test path: $resolvedTestRoot"
}
try {
  $repo = Join-Path $testRoot 'repo'
  $source = Join-Path $repo 'frontend'
  $deploy = Join-Path $repo 'deploy\iis'
  New-Item -ItemType Directory -Path $source -Force | Out-Null

  Assert-Throws { Assert-SafeDeployTarget $repo $repo } 'repository root'
  Assert-Throws { Assert-SafeDeployTarget $repo (Split-Path -Parent $repo) } 'repository ancestor'
  Assert-Throws { Assert-SafeDeployTarget $repo (Join-Path $source 'dist') } 'source descendant'
  Assert-Throws { Assert-SafeDeployTarget $repo (Join-Path $repo 'docs\new-output') } 'non-deploy repository descendant'
  Assert-Throws { Assert-SafeDeployTarget $repo (Join-Path $repo 'deploy') } 'deploy root'
  Assert-Throws { Assert-SafeDeployTarget $repo ([System.IO.Path]::GetPathRoot($repo)) } 'drive root'

  $junction = Join-Path $repo 'deploy\linked-source'
  New-Item -ItemType Directory -Path (Split-Path -Parent $junction) -Force | Out-Null
  $junctionCreated = $false
  try {
    New-Item -ItemType Junction -Path $junction -Target $source -ErrorAction Stop | Out-Null
    $junctionCreated = $true
  }
  catch {
    Write-Host 'junction guard test skipped because junction creation is unavailable'
  }
  if ($junctionCreated) {
    Assert-Throws { Assert-SafeDeployTarget $repo (Join-Path $junction 'iis') } 'junction parent'
  }

  New-Item -ItemType Directory -Path $deploy -Force | Out-Null
  Assert-Throws { Assert-SafeDeployTarget $repo $deploy } 'unknown existing directory'
  Write-DeployOwnershipMarker $deploy $deploy
  $accepted = Assert-SafeDeployTarget $repo $deploy
  if (-not (Test-SamePath $accepted $deploy)) { throw 'Owned output was not accepted' }

  New-Item -ItemType Directory -Path (Join-Path $deploy 'App_Data') -Force | Out-Null
  Assert-Throws { Assert-SafeDeployTarget $repo $deploy } 'output containing App_Data'
  Remove-Item -LiteralPath (Join-Path $deploy 'App_Data') -Recurse -Force

  $staging = Join-Path $repo 'deploy\.iis.staging'
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  Write-DeployOwnershipMarker $staging $deploy
  [System.IO.File]::WriteAllText((Join-Path $staging 'new.txt'), 'new')
  [System.IO.File]::WriteAllText((Join-Path $deploy 'old.txt'), 'old')
  Publish-OwnedDeployDirectory $staging $deploy $repo | Out-Null
  if (-not (Test-Path -LiteralPath (Join-Path $deploy 'new.txt'))) { throw 'New output not published' }
  if (Test-Path -LiteralPath (Join-Path $deploy 'old.txt')) { throw 'Old owned output remains' }
  Write-Host 'deploy-iis path safety checks passed'
}
finally {
  if (Test-Path -LiteralPath $resolvedTestRoot) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
  }
}
