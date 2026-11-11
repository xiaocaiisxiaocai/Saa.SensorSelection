<#
.SYNOPSIS
  将前端和 .NET 8 后端合并发布到一个 IIS 站点目录。

.DESCRIPTION
  OutputDir 是脚本拥有的发布制品目录，可作为新站点物理路径：
  - 后端 DLL、exe、web.config 位于根目录；
  - 前端 dist 位于 wwwroot；
  - 不包含 SQLite 数据库或现有站点 App_Data；
  - 不生成压缩包，也不拆分 frontend/backend 子目录。

  pnpm 依赖校验强制使用 --offline --frozen-lockfile，缓存不完整时直接失败，不会联网下载。

.PARAMETER OutputDir
  IIS 发布制品目录，默认：仓库根目录下的 deploy\iis。不能指向已有站点目录。
.PARAMETER Clean
  兼容旧命令。只会替换带本项目所有权标记且不含 App_Data 的旧制品。
.PARAMETER SkipInstall
  跳过 pnpm install --offline --frozen-lockfile。
.PARAMETER BasePath
  Vite 部署路径，根站点使用 /。
.PARAMETER ApiBase
  VITE_API_BASE，默认 /api。
.PARAMETER SelfContained
  发布 win-x64 自包含后端；默认需要 IIS 服务器安装 .NET 8 Hosting Bundle。
.PARAMETER JwtKey
  可选的生产 JWT 密钥。不传时自动随机生成。
.PARAMETER AdminPassword
  初始管理员密码。不传时随机生成并写入受限的凭据文件。
.PARAMETER CorsAllowedOrigins
  生产环境允许的前端来源，默认覆盖 localhost 和 127.0.0.1:3336。
#>

[CmdletBinding()]
param(
  [string]$OutputDir = '',
  [switch]$Clean,
  [switch]$SkipInstall,
  [string]$BasePath = '/',
  [string]$ApiBase = '/api',
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release',
  [switch]$SelfContained,
  [string]$JwtKey = '',
  [string]$AdminPassword = '',
  [string]$CorsAllowedOrigins = 'http://localhost:3336,http://127.0.0.1:3336'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'deploy-iis-paths.ps1')

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "未找到命令：$Name"
  }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令失败（退出码 $LASTEXITCODE）：$Command $($Arguments -join ' ')"
  }
}

function Resolve-PathValue([string]$Value) {
  return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Value)
}

function Normalize-BasePath([string]$Value) {
  $result = if ([string]::IsNullOrWhiteSpace($Value)) { '/' } else { $Value.Trim() }
  if (-not $result.StartsWith('/')) { $result = '/' + $result }
  if (-not $result.EndsWith('/')) { $result += '/' }
  return $result
}

function Write-Utf8NoBom([string]$PathValue, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($PathValue, $Content.Trim() + [Environment]::NewLine, $encoding)
}

function New-RandomSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Protect-CredentialsFile([string]$PathValue) {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $systemSid = New-Object System.Security.Principal.SecurityIdentifier(
    [System.Security.Principal.WellKnownSidType]::LocalSystemSid,
    $null)
  $acl = Get-Acl -LiteralPath $PathValue
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($identity.User, $systemSid)) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $sid,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $PathValue -AclObject $acl
}

$repoRoot = Resolve-PathValue (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = Join-Path $repoRoot 'deploy\iis' }
$OutputDir = Assert-SafeDeployTarget $repoRoot (Resolve-PathValue $OutputDir)
$outputParent = Split-Path -Parent $OutputDir
if (-not (Test-Path -LiteralPath $outputParent)) {
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}
$outputLeaf = Split-Path -Leaf $OutputDir
$stagingDir = Join-Path $outputParent ('.' + $outputLeaf + '.staging-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagingDir | Out-Null
$publishDir = $stagingDir

$frontendDir = Join-Path $repoRoot 'frontend'
$distDir = Join-Path $frontendDir 'dist'
$backendProject = Join-Path $repoRoot 'backend\Saa.SensorSelection.Api\Saa.SensorSelection.Api.csproj'
$wwwroot = Join-Path $publishDir 'wwwroot'
$BasePath = Normalize-BasePath $BasePath
if ([string]::IsNullOrWhiteSpace($ApiBase)) { $ApiBase = '/api' }

$publishComplete = $false
try {
Assert-Command 'node'; Assert-Command 'pnpm'; Assert-Command 'dotnet'
$nodeVersion = (& node -v).Trim()
$pnpmVersion = (& pnpm --version).Trim()
$dotnetVersion = (& dotnet --version).Trim()
if ($nodeVersion -notmatch '^v(2[0-9]|[3-9]\d)\.') { throw "Node.js 版本不满足要求：$nodeVersion" }
if ($pnpmVersion -notmatch '^(9|[1-9]\d)\.') { throw "pnpm 版本不满足要求：$pnpmVersion" }
if ((& dotnet --list-sdks | Out-String) -notmatch '(?m)^8\.') { throw '未找到 .NET 8 SDK' }
if (-not (Test-Path (Join-Path $frontendDir 'package.json'))) { throw "未找到前端项目：$frontendDir" }
if (-not (Test-Path (Join-Path $frontendDir 'pnpm-lock.yaml'))) { throw '未找到 frontend/pnpm-lock.yaml' }
if (-not (Test-Path $backendProject)) { throw "未找到后端项目：$backendProject" }

Write-Host "==> IIS 单目录制品：$OutputDir"
Write-Host "==> Node.js $nodeVersion / pnpm $pnpmVersion / dotnet SDK $dotnetVersion"
Write-Host "==> VITE_BASE $BasePath / VITE_API_BASE $ApiBase"

if (-not $SkipInstall) {
  Write-Host '==> 校验前端依赖（离线、锁文件固定）'
  Push-Location $frontendDir
  try { Invoke-Checked 'pnpm' @('install', '--offline', '--frozen-lockfile') }
  finally { Pop-Location }
}

Write-Host '==> 构建前端生产包'
$oldBase = [Environment]::GetEnvironmentVariable('VITE_BASE', 'Process')
$oldApi = [Environment]::GetEnvironmentVariable('VITE_API_BASE', 'Process')
$oldHistory = [Environment]::GetEnvironmentVariable('VITE_ROUTER_HISTORY', 'Process')
$env:VITE_BASE = $BasePath
$env:VITE_API_BASE = $ApiBase
$env:VITE_ROUTER_HISTORY = 'hash'
Push-Location $frontendDir
try { Invoke-Checked 'pnpm' @('run', 'build') }
finally {
  Pop-Location
  if ($null -eq $oldBase) { Remove-Item Env:VITE_BASE -ErrorAction SilentlyContinue } else { $env:VITE_BASE = $oldBase }
  if ($null -eq $oldApi) { Remove-Item Env:VITE_API_BASE -ErrorAction SilentlyContinue } else { $env:VITE_API_BASE = $oldApi }
  if ($null -eq $oldHistory) { Remove-Item Env:VITE_ROUTER_HISTORY -ErrorAction SilentlyContinue } else { $env:VITE_ROUTER_HISTORY = $oldHistory }
}
if (-not (Test-Path (Join-Path $distDir 'index.html'))) { throw '前端构建产物缺少 dist/index.html' }

Write-Host '==> 发布 .NET 8 后端到同一个 IIS 目录'
$publishArgs = @('publish', $backendProject, '--configuration', $Configuration, '--no-restore', '--output', $publishDir, '--nologo')
if ($SelfContained) { $publishArgs += @('--runtime', 'win-x64', '--self-contained', 'true') }
else { $publishArgs += @('--self-contained', 'false') }
Invoke-Checked 'dotnet' $publishArgs
$webConfigPath = Join-Path $publishDir 'web.config'
if (-not (Test-Path $webConfigPath)) { throw '后端发布产物缺少 web.config' }
if ((Get-Content -LiteralPath $webConfigPath -Raw) -notmatch 'maxAllowedContentLength') {
  throw 'web.config 缺少 requestLimits，IIS 会拦截大于约 28.6 MB 的上传'
}

$demoStorePath = Join-Path $publishDir 'Data\demo-store.json'
if (Test-Path $demoStorePath) {
  throw "生产发布产物不应包含演示数据文件：$demoStorePath"
}

Write-Host '==> 将前端 dist 合并到后端 wwwroot'
New-Item -ItemType Directory -Path $wwwroot -Force | Out-Null
Get-ChildItem -LiteralPath $distDir -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $wwwroot -Recurse -Force
}
if (-not (Test-Path (Join-Path $wwwroot 'index.html'))) { throw '合并后的 wwwroot 缺少 index.html' }

if ([string]::IsNullOrWhiteSpace($JwtKey)) { $JwtKey = New-RandomSecret 48 }
if ([string]::IsNullOrWhiteSpace($AdminPassword)) { $AdminPassword = New-RandomSecret 24 }
if ([string]::IsNullOrWhiteSpace($CorsAllowedOrigins)) {
  throw 'CorsAllowedOrigins 不能为空，请传入浏览器实际访问地址，例如 http://192.168.7.102:3336'
}

$productionSettings = [ordered]@{
  Jwt = [ordered]@{ Key = $JwtKey }
  Seed = [ordered]@{
    AdminPassword = $AdminPassword
    AllowDefaultPassword = $false
    LoadDemoStore = $false
  }
  Cors = [ordered]@{ AllowedOrigins = $CorsAllowedOrigins }
}
Write-Utf8NoBom (Join-Path $publishDir 'appsettings.Production.json') ($productionSettings | ConvertTo-Json -Depth 4)
$credentials = @"
SAA 感应器选型初始部署凭据

管理员账号：admin
初始管理员密码：$AdminPassword

请首次登录后立即修改密码，并删除本文件。
本文件不在 wwwroot 中，不会作为前端静态文件发布，但仍应限制文件系统权限。
"@
$credentialsPath = Join-Path $publishDir 'DEPLOYMENT-CREDENTIALS.txt'
Write-Utf8NoBom $credentialsPath $credentials
Protect-CredentialsFile $credentialsPath
Write-Host '==> 已生成仅当前用户和 SYSTEM 可读的初始凭据文件；密码不会输出到控制台'

$guide = @"
# IIS 单目录部署说明

本目录是完整、无数据库的 IIS 发布制品。新站点可直接使用；更新已有站点时应先停站，
再按下面的保留规则复制，不要把已有站点目录传给本打包脚本：

- 根目录：ASP.NET Core 8 后端发布文件和 web.config
- `wwwroot/`：前端构建产物，由后端 UseDefaultFiles/UseStaticFiles 提供
- 不含 `App_Data`：服务器现有 SQLite 数据库不属于发布制品

部署步骤：
1. IIS 安装 ASP.NET Core 8 Hosting Bundle（非自包含发布必须）。
2. 新建 IIS 网站时，物理路径可直接指向本目录；已有网站先备份并保留原 `App_Data`，再复制新制品文件。
3. 应用程序池选择“无托管代码”，启用 64 位应用程序。
4. 给 `App_Data` 授予 IIS 应用程序池身份读写权限。
5. 脚本已自动生成 `appsettings.Production.json`，其中包含随机 JWT 密钥、随机初始管理员密码和 CORS 来源。
6. 初始管理员密码见受限权限的 `DEPLOYMENT-CREDENTIALS.txt`，首次登录后立即修改并删除该文件。
7. 更新站点时必须保留服务器原有的 `App_Data`；不要清空服务器站点目录，也不要使用会删除目标多余文件的 `/MIR`。复制后重新核对数据库路径和 ACL。

前端 API 基地址：`$ApiBase`。当前默认同源 `/api`，不需要 ARR/URL Rewrite。
默认 CORS 来源：`$CorsAllowedOrigins`。如果通过服务器 IP 或其他端口访问，请重新打包时传入 `-CorsAllowedOrigins`。
构建使用 `pnpm install --offline --frozen-lockfile`，IIS 服务器不需要 Node.js/npm。
"@
Write-Utf8NoBom (Join-Path $publishDir 'DEPLOYMENT.md') $guide

$manifest = [ordered]@{
  project = 'SAA Sensor Selection'
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  targetFramework = 'net8.0'
  configuration = $Configuration
  node = $nodeVersion
  pnpm = $pnpmVersion
  dotnetSdk = $dotnetVersion
  viteBase = $BasePath
  apiBase = $ApiBase
  routerHistory = 'hash'
  selfContained = [bool]$SelfContained
  databaseIncluded = $false
  siteLayout = 'backend-root-with-wwwroot'
}
Write-Utf8NoBom (Join-Path $publishDir 'deploy-manifest.json') ($manifest | ConvertTo-Json -Depth 5)
Write-DeployOwnershipMarker $publishDir $OutputDir
Publish-OwnedDeployDirectory $publishDir $OutputDir $repoRoot | Out-Null
$publishComplete = $true
Write-Host "==> IIS 单目录制品完成：$OutputDir（未生成压缩包、不含数据库）"
}
finally {
  if (-not $publishComplete -and (Test-Path -LiteralPath $stagingDir)) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force
  }
}
