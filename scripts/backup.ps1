param(
  [string]$OutputDirectory = ".\backups"
)

$ErrorActionPreference = "Stop"
$composeRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$destination = [System.IO.Path]::GetFullPath((Join-Path $composeRoot $OutputDirectory))
New-Item -ItemType Directory -Path $destination -Force | Out-Null

$composeArgs = @("compose", "--project-directory", $composeRoot, "-f", (Join-Path $composeRoot "docker-compose.yml"))
$containerId = docker @composeArgs ps -q postgres
if (-not $containerId) { throw "PostgreSQL chưa chạy. Hãy khởi động docker compose trước." }

$database = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "meotdc" }
$username = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "meotdc" }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$containerFile = "/tmp/meotdc-$stamp.dump"
$outputFile = Join-Path $destination "meotdc-$stamp.dump"

docker @composeArgs exec -T postgres pg_dump -Fc --no-owner -U $username -d $database -f $containerFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump không thành công." }
docker cp "${containerId}:$containerFile" $outputFile
if ($LASTEXITCODE -ne 0) { throw "Không sao chép được bản sao lưu khỏi container." }
docker @composeArgs exec -T postgres rm -f $containerFile | Out-Null
Write-Output "Đã tạo bản sao lưu: $outputFile"
