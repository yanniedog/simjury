# Deploy simjury-web using Cloudflare credentials from AustralianRates/.env when unset.
$ErrorActionPreference = 'Stop'
$siteRoot = $PSScriptRoot
$arEnvCandidates = @(
  (Join-Path $siteRoot '..\..\AustralianRates\.env'),
  'c:\code\AustralianRates\.env'
)
$arEnv = $arEnvCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $env:CLOUDFLARE_API_TOKEN -and $arEnv) {
  Get-Content $arEnv | ForEach-Object {
    if ($_ -match '^\s*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=(.*)$') {
      Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
    }
  }
  Write-Host "Loaded Cloudflare credentials from $arEnv"
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Error 'CLOUDFLARE_API_TOKEN is not set. Copy site/.env.example values from AustralianRates/.env'
}
Set-Location $siteRoot
npm run deploy
