param(
  [string]$Tag = "tagname"
)

$ErrorActionPreference = "Stop"
$namespace = "vuongdeptraii2k8"
$webImage = "${namespace}/duantuonglai:${Tag}"
$apiImage = "${namespace}/meotdc-api:${Tag}"

if ($Tag -notmatch "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$") { throw "Tag Docker không hợp lệ." }
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) { throw "Cần Docker Engine/CLI để build và push image." }

$serverVersion = & $docker.Source info --format '{{.ServerVersion}}' 2>$null
if ($LASTEXITCODE -ne 0 -or -not $serverVersion) { throw "Docker Engine chưa chạy. Không build hoặc push image rỗng/thay thế." }

$googleClientId = $env:NEXT_PUBLIC_GOOGLE_CLIENT_ID
if (-not $googleClientId -and (Test-Path -LiteralPath ".env" -PathType Leaf)) {
  $envText = [IO.File]::ReadAllText((Resolve-Path ".env"))
  $match = [regex]::Match($envText, "(?m)^NEXT_PUBLIC_GOOGLE_CLIENT_ID\s*=\s*(.+?)\s*$")
  if (-not $match.Success) { $match = [regex]::Match($envText, "(?m)^GOOGLE_CLIENT_ID\s*=\s*(.+?)\s*$") }
  if ($match.Success) { $googleClientId = $match.Groups[1].Value.Trim() }
}
if (-not $googleClientId) { Write-Warning "Image web sẽ được build không có Google Client ID; hãy rebuild với NEXT_PUBLIC_GOOGLE_CLIENT_ID trước khi bật Google login." }

Write-Output "Đăng nhập Docker Hub bằng device flow nếu cần. Xác nhận tài khoản phải là $namespace."
& $docker.Source login
if ($LASTEXITCODE -ne 0) { throw "Đăng nhập Docker Hub thất bại." }
$loggedInUser = & $docker.Source info --format '{{.Username}}'
if ($LASTEXITCODE -ne 0 -or $loggedInUser.Trim() -ne $namespace) { throw "Docker Hub đang đăng nhập bằng tài khoản khác. Đăng nhập đúng $namespace rồi chạy lại." }

$buildArgs = @("build", "--file", "apps/api/Dockerfile", "--tag", $apiImage, ".")
& $docker.Source @buildArgs
if ($LASTEXITCODE -ne 0) { throw "Build ảnh API thất bại." }

$webBuildArgs = @("build", "--file", "apps/web/Dockerfile", "--tag", $webImage, "--build-arg", "NEXT_PUBLIC_API_BASE_URL=http://api:4000")
if ($googleClientId) { $webBuildArgs += @("--build-arg", "NEXT_PUBLIC_GOOGLE_CLIENT_ID=$googleClientId") }
$webBuildArgs += "."
& $docker.Source @webBuildArgs
if ($LASTEXITCODE -ne 0) { throw "Build ảnh web thất bại." }

& $docker.Source push $apiImage
if ($LASTEXITCODE -ne 0) { throw "Push ảnh API thất bại." }
& $docker.Source push $webImage
if ($LASTEXITCODE -ne 0) { throw "Push ảnh web thất bại." }

Write-Output "Đã push $webImage và $apiImage."
