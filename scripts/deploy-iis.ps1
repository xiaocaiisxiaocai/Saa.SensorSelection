<#
.SYNOPSIS
  构建感应器选型前端，并打包为可部署到 IIS 的静态站点目录。

.DESCRIPTION
  1. 检查 Node.js / pnpm
  2. 安装依赖（可用 -SkipInstall 跳过）
  3. 执行 pnpm run build
  4. 将 apps/web-ele/dist 复制到输出目录，并写入 IIS 用 web.config
  5. 可选生成 zip

  生产环境默认使用 hash 路由（VITE_ROUTER_HISTORY=hash），IIS 无需 URL Rewrite 也能打开子路由。
  若站点挂在虚拟目录（如 /sensor），请用 -BasePath '/sensor/' 重新构建。

  前端已接入 ASP.NET Core 后端（backend/Saa.SensorSelection.Api，JWT + SQLite）：
  - 默认同源 /api（需在 IIS 用 ARR/URL Rewrite 把 /api 反向代理到后端，或用站点本身托管后端）；
  - 或用 -ApiBase 指向后端地址（如 http://server:5080/api，后端已开 CORS）。

.PARAMETER OutputDir
  部署包输出目录。默认：仓库根目录下的 deploy\iis

.PARAMETER Zip
  生成 zip 压缩包到输出目录旁。

.PARAMETER SkipInstall
  跳过 pnpm install（依赖已装好时使用）。

.PARAMETER BasePath
  对应 Vite/Vben 的 VITE_BASE，必须以 / 开头和结尾（根站点用 '/'）。

.PARAMETER ApiBase
  对应 VITE_API_BASE（前端 API 基地址）。默认 '/api'（同源反向代理）。

.EXAMPLE
  .\scripts\deploy-iis.ps1

.EXAMPLE
  .\scripts\deploy-iis.ps1 -Zip

.EXAMPLE
  .\scripts\deploy-iis.ps1 -BasePath '/sensor/' -OutputDir 'D:\publish\sensor' -Zip

.EXAMPLE
  .\scripts\deploy-iis.ps1 -ApiBase 'http://10.0.0.8:5080/api' -Zip
#>

[CmdletBinding()]
param(
  [string]$OutputDir = '',
  [switch]$Zip,
  [switch]$SkipInstall,
  [string]$BasePath = '/',
  [string]$ApiBase = '/api'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "未找到命令：$Name。请先安装并确保已加入 PATH。"
  }
}

function Normalize-BasePath([string]$PathValue) {
  $value = if ([string]::IsNullOrWhiteSpace($PathValue)) { '/' } else { $PathValue.Trim() }
  if (-not $value.StartsWith('/')) {
    $value = '/' + $value
  }
  if (-not $value.EndsWith('/')) {
    $value = $value + '/'
  }
  return $value
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $repoRoot 'deploy\iis'
}
else {
  $OutputDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir)
}

$BasePath = Normalize-BasePath $BasePath
$distDir = Join-Path $repoRoot 'apps\web-ele\dist'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath = Join-Path (Split-Path -Parent $OutputDir) ("sensor-selection-iis-$stamp.zip")

Write-Host '==> 仓库根目录:' $repoRoot
Write-Host '==> 输出目录:' $OutputDir
Write-Host '==> VITE_BASE:' $BasePath

Assert-Command 'node'
Assert-Command 'pnpm'

$nodeVersion = (& node -v).Trim()
Write-Host '==> Node.js' $nodeVersion
if ($nodeVersion -notmatch '^v(2[0-9]|[3-9]\d)\.') {
  Write-Warning "建议使用 Node.js 20.10+，当前为 $nodeVersion"
}

if (-not $SkipInstall) {
  Write-Host '==> 安装依赖 (pnpm install --frozen-lockfile)'
  pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败，退出码 $LASTEXITCODE" }
}
else {
  Write-Host '==> 跳过依赖安装 (-SkipInstall)'
}

Write-Host '==> 构建生产包'
$env:VITE_BASE = $BasePath
$env:VITE_API_BASE = $ApiBase
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }

if (-not (Test-Path (Join-Path $distDir 'index.html'))) {
  throw "未找到构建产物：$distDir\index.html"
}

Write-Host '==> 准备 IIS 发布目录'
if (Test-Path $OutputDir) {
  Remove-Item -Recurse -Force $OutputDir
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null
Copy-Item -Path (Join-Path $distDir '*') -Destination $OutputDir -Recurse -Force

# IIS：默认文档 + 静态 MIME。
# 生产为 hash 路由，不要写 <rewrite>：未安装 URL Rewrite 时 IIS 会报 500.19 / 0x8007000d。
$webConfig = @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <defaultDocument enabled="true">
      <files>
        <clear />
        <add value="index.html" />
      </files>
    </defaultDocument>
    <directoryBrowse enabled="false" />
    <staticContent>
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".webp" />
      <mimeMap fileExtension=".webp" mimeType="image/webp" />
      <remove fileExtension=".mjs" />
      <mimeMap fileExtension=".mjs" mimeType="text/javascript" />
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="7.00:00:00" />
    </staticContent>
    <httpProtocol>
      <customHeaders>
        <remove name="X-Content-Type-Options" />
        <add name="X-Content-Type-Options" value="nosniff" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
'@

$webConfigPath = Join-Path $OutputDir 'web.config'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($webConfigPath, $webConfig.Trim() + [Environment]::NewLine, $utf8NoBom)

$fileCount = (Get-ChildItem -Path $OutputDir -Recurse -File).Count
Write-Host "==> 已输出 $fileCount 个文件到 $OutputDir"

if ($Zip) {
  if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
  }
  Compress-Archive -Path (Join-Path $OutputDir '*') -DestinationPath $zipPath -Force
  Write-Host '==> 已生成压缩包:' $zipPath
}

Write-Host ''
Write-Host '部署到 IIS 建议步骤：'
Write-Host '  1. 将输出目录内容复制到站点物理路径（或解压 zip）'
Write-Host '  2. IIS 新建网站 / 应用程序池：.NET CLR 选「无托管代码」'
Write-Host '  3. 绑定主机名与端口；根站点 BasePath 用 /，虚拟目录用 -BasePath ''/你的路径/'''
Write-Host '  4. 前端需连接后端：同源则用 ARR/URL Rewrite 把 /api 代理到 backend/Saa.SensorSelection.Api（dotnet publish 部署）；跨域则重新构建并指定 -ApiBase'
Write-Host '  5. 本包 web.config 不含 URL Rewrite，适配未安装该模块的 IIS（同源 /api 代理需另配 ARR）'
Write-Host ''
Write-Host '完成。'
