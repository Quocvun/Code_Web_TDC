$ErrorActionPreference = "Stop"

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) { throw "Docker CLI chưa được cài. Cài Docker Desktop rồi chạy lại script." }
if (-not (Test-Path -LiteralPath ".env" -PathType Leaf)) { throw "Tạo .env từ .env.example và điền cấu hình production trước khi publish." }

$registryUser = if ($env:DOCKERHUB_USERNAME) { $env:DOCKERHUB_USERNAME.Trim() } else { "vuongdeptraii2k8" }
$imageTag = if ($env:MEOTDC_IMAGE_TAG) { $env:MEOTDC_IMAGE_TAG.Trim() } else { "latest" }
if ($registryUser -notmatch "^[a-z0-9][a-z0-9_-]{0,29}$") { throw "DOCKERHUB_USERNAME không hợp lệ." }
if ($imageTag -notmatch "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$") { throw "MEOTDC_IMAGE_TAG không hợp lệ." }
if (-not $env:DOCKERHUB_TOKEN) { throw "Đặt Docker Hub access token có quyền write vào biến môi trường DOCKERHUB_TOKEN trước khi chạy." }

$envText = [System.IO.File]::ReadAllText((Resolve-Path ".env"))
foreach ($key in @("GOOGLE_CLIENT_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID", "MEOTDC_ADMIN_EMAIL", "POSTGRES_PASSWORD", "MINIO_ROOT_PASSWORD")) {
  $match = [regex]::Match($envText, "(?m)^$key\s*=\s*(.+?)\s*$")
  if (-not $match.Success -or $match.Groups[1].Value -match "^(YOUR_|REPLACE_|CHANGE_|example|demo|meotdc|password)" -or $match.Groups[1].Value -match "\s+#") {
    throw "$key chưa được điền trong .env. Không publish ảnh production với giá trị mẫu." 
  }
  if ($key -in @("POSTGRES_PASSWORD", "MINIO_ROOT_PASSWORD") -and $match.Groups[1].Value.Length -lt 24) {
    throw "$key phải dài ít nhất 24 ký tự trước khi publish."
  }
}
$domainMatch = [regex]::Match($envText, "(?m)^MEOTDC_DOMAINS\s*=\s*(.+?)\s*$")
if (-not $domainMatch.Success) { $domainMatch = [regex]::Match($envText, "(?m)^MEOTDC_DOMAIN\s*=\s*(.+?)\s*$") }
$originMatch = [regex]::Match($envText, "(?m)^MEOTDC_WEB_ORIGINS\s*=\s*(.+?)\s*$")
if (-not $originMatch.Success) { $originMatch = [regex]::Match($envText, "(?m)^MEOTDC_WEB_ORIGIN\s*=\s*(.+?)\s*$") }
$domains = $domainMatch.Groups[1].Value
$origins = $originMatch.Groups[1].Value
if (-not $domains -or -not $origins) { throw "Đặt MEOTDC_DOMAINS và MEOTDC_WEB_ORIGINS trong .env trước khi publish." }
if ($domains -match "(?i)(^|,)\s*(?:[^,]+\.)?localhost(\s*,|$)" -or $domains -match "(?i)(^|,)\s*127\.0\.0\.1(\s*,|$)") {
  throw "Đặt MEOTDC_DOMAINS thành các domain công khai trước khi publish."
}
if ($origins -notmatch "^https://" -or $origins -match "(?i),\s*http://") { throw "MEOTDC_WEB_ORIGINS phải chỉ gồm các origin HTTPS công khai." }
$domainHosts = @($domains.Split(",") | ForEach-Object { ([uri]("https://" + $_.Trim())).DnsSafeHost.ToLowerInvariant() })
$originHosts = @($origins.Split(",") | ForEach-Object {
  $origin = [uri]$_.Trim()
  if (-not $origin.IsAbsoluteUri -or $origin.Scheme -ne "https" -or $origin.PathAndQuery -ne "/") { throw "MEOTDC_WEB_ORIGINS chỉ nhận origin HTTPS, không kèm đường dẫn." }
  $origin.DnsSafeHost.ToLowerInvariant()
})
foreach ($hostName in $originHosts) { if ($hostName -notin $domainHosts) { throw "Thêm host $hostName vào MEOTDC_DOMAINS để Caddy phục vụ origin này." } }

$env:DOCKERHUB_USERNAME = $registryUser
$env:MEOTDC_IMAGE_TAG = $imageTag
$token = $env:DOCKERHUB_TOKEN
$token | & $docker.Source login --username $registryUser --password-stdin
if ($LASTEXITCODE -ne 0) { throw "Đăng nhập Docker Hub thất bại." }

& $docker.Source compose build api web
if ($LASTEXITCODE -ne 0) { throw "Build ảnh MeoTDC thất bại." }

& $docker.Source compose push api web
if ($LASTEXITCODE -ne 0) { throw "Push ảnh MeoTDC lên Docker Hub thất bại." }

Write-Output "Đã publish ${registryUser}/meotdc-api:${imageTag} và ${registryUser}/duantuonglai:${imageTag}."
