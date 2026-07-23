# Deploy simjury-web using environment credentials or an ignored site/.env file.
$ErrorActionPreference = 'Stop'
$siteRoot = $PSScriptRoot
$localEnv = Join-Path $siteRoot '.env'

if (-not $env:CLOUDFLARE_API_TOKEN -and (Test-Path $localEnv)) {
  Get-Content $localEnv | ForEach-Object {
    if ($_ -match '^\s*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)=(.*)$') {
      Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
    }
  }
  Write-Host "Loaded Cloudflare credentials from $localEnv"
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Error 'CLOUDFLARE_API_TOKEN is not set. Export it or create an ignored site/.env from site/.env.example.'
}
Set-Location $siteRoot
npm run deploy
