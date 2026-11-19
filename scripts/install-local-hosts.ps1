$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Hãy chạy PowerShell với quyền quản trị để cài các tên miền local."
}

$domains = @(
  "meotdc.localhost",
  "student.meotdc.localhost",
  "teacher.meotdc.localhost",
  "school.meotdc.localhost",
  "admin.meotdc.localhost"
)
$hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
$startMarker = "# BEGIN MEOTDC LOCAL DEMO HOSTS"
$endMarker = "# END MEOTDC LOCAL DEMO HOSTS"
$managedBlock = @(
  $startMarker
  "127.0.0.1 $($domains -join ' ')"
  $endMarker
) -join [Environment]::NewLine
$hostsText = [IO.File]::ReadAllText($hostsPath)
$markerPattern = [regex]::Escape($startMarker) + ".*?" + [regex]::Escape($endMarker)
if ([regex]::IsMatch($hostsText, $markerPattern, [Text.RegularExpressions.RegexOptions]::Singleline)) {
  $hostsText = [regex]::Replace($hostsText, $markerPattern, $managedBlock, [Text.RegularExpressions.RegexOptions]::Singleline)
} else {
  $hostsText = $hostsText.TrimEnd() + [Environment]::NewLine + $managedBlock + [Environment]::NewLine
}
[IO.File]::WriteAllText($hostsPath, $hostsText, [Text.UTF8Encoding]::new($false))

$apiEnvPath = Join-Path $PSScriptRoot "..\apps\api\.env"
if (Test-Path -LiteralPath $apiEnvPath) {
  $apiEnv = [IO.File]::ReadAllLines($apiEnvPath)
  $apiEnv = @($apiEnv | Where-Object { $_ -notmatch '^\s*MEOTDC_WEB_ORIGINS?\s*=' })
  $apiEnv += "MEOTDC_WEB_ORIGINS=$(@($domains | ForEach-Object { "http://${_}:3000" }) -join ',')"
  [IO.File]::WriteAllLines($apiEnvPath, $apiEnv, [Text.UTF8Encoding]::new($false))
}

& ipconfig.exe /flushdns | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Không thể làm mới cache DNS của Windows." }
Write-Output "Đã trỏ các tên miền local về 127.0.0.1: $($domains -join ', ')"
