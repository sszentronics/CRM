# One-step test deployment on the local network. Run it with start-testing.bat (double-click).
# Starts Docker and Supabase, finds this computer's network address, builds the app for that
# address, opens the firewall for the test ports, and serves the CRM to everyone on the Wi-Fi.
# For testing only: the database holds demo data.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$port = 3200
$ports = @($port, 54321, 54324)

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Magenta }

# 1. This computer's address on the network (the adapter that has the default route).
Step "Finding this computer's address"
$route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Sort-Object RouteMetric | Select-Object -First 1
$ip = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $ip) { throw "No network connection found. Join the Wi-Fi and try again." }
Write-Host "Address: $ip"

# 2. Docker, then Supabase.
Step "Starting Docker"
docker ps *> $null
if ($LASTEXITCODE -ne 0) {
  $exe = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"
  if (-not (Test-Path $exe)) { $exe = "C:\Program Files\Docker\Docker\Docker Desktop.exe" }
  Start-Process $exe
  for ($i = 0; $i -lt 40; $i++) { Start-Sleep 5; docker ps *> $null; if ($LASTEXITCODE -eq 0) { break } }
  docker ps *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker did not start. Open Docker Desktop, wait for 'Engine running', and run this again." }
}
Step "Starting the database (Supabase)"
pnpm db:start | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Supabase did not start." }

# 3. Firewall: one Windows prompt the first time.
Step "Opening the firewall for ports $($ports -join ', ')"
$rule = Get-NetFirewallRule -DisplayName "Trading Labs test (LAN)" -ErrorAction SilentlyContinue
if (-not $rule) {
  $cmd = "New-NetFirewallRule -DisplayName 'Trading Labs test (LAN)' -Direction Inbound -Protocol TCP -LocalPort $($ports -join ',') -Action Allow -Profile Any"
  Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile", "-Command", $cmd
}

# 4. Build for this address (the address is baked into the pages, so rebuild if it changed).
$env:NEXT_PUBLIC_SUPABASE_URL = "http://${ip}:54321"
$stamp = Join-Path $root ".next\lan-ip.txt"
$built = (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $ip) -and (Test-Path (Join-Path $root ".next\BUILD_ID"))
if (-not $built) {
  Step "Building the app (a few minutes the first time)"
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw "The build failed." }
  Set-Content -Path $stamp -Value $ip
}

# 5. Serve it.
Step "Ready"
Write-Host "`n  Tell everyone on the Wi-Fi to open:  http://${ip}:${port}" -ForegroundColor Green
Write-Host "  Test emails (password resets) show at:  http://${ip}:54324"
Write-Host "  Demo sign-ins:  .seed-credentials.local  (agents and team leads need no authenticator code)"
Write-Host "  Keep this window open and the computer awake. Press Ctrl+C to stop.`n"
pnpm start -H 0.0.0.0 -p $port
