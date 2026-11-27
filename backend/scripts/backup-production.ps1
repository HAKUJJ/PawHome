# =========================================================
# สำรองฐานข้อมูล PawHome (อ่านอย่างเดียว · pg_dump) ก่อนรัน migration — รันด้วยมือเท่านั้น
#
#   powershell -File backend/scripts/backup-production.ps1 -ConfirmHost db.<ref>.supabase.co
#
# - อ่าน DATABASE_URL จาก backend/.env (ต้องเป็น Direct connection: db.<ref>.supabase.co:5432) · ไม่พิมพ์รหัสผ่าน
#   ไม่ส่งรหัสผ่านทาง command line (ใช้ PGPASSWORD เฉพาะ process นี้)
# - ต้องพิมพ์ hostname ให้ตรง (กันสำรองผิดฐานข้อมูล)
# - เก็บไฟล์นอก repo เสมอ (ค่าเริ่มต้น %USERPROFILE%\PawHome-backups) · ปฏิเสธโฟลเดอร์ที่อยู่ใน repo
# - ใช้ pg_dump เวอร์ชันหลักเดียวกับ server (Supabase = 17)
# ผลลัพธ์: <timestamp>-public-storage.dump (custom format) + .sha256 + รายการ object จาก pg_restore --list
# =========================================================
param(
  [Parameter(Mandatory = $true)][string]$ConfirmHost,
  [string]$OutDir = (Join-Path $env:USERPROFILE "PawHome-backups"),
  [string]$PgBin = "C:\Program Files\PostgreSQL\17\bin",
  [string]$EnvFile = ""
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$envFile = if ($EnvFile) { $EnvFile } else { Join-Path $repo "backend\.env" }
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw "ไม่พบ DATABASE_URL ใน backend/.env" }
$uri = [Uri](($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"'))
if ($uri.Host -ne $ConfirmHost) { throw "hostname ไม่ตรง: .env ชี้ $($uri.Host.Substring(0, [Math]::Min(9, $uri.Host.Length)))… แต่ยืนยัน $ConfirmHost" }
if ($uri.Host -match 'pooler') { throw "ใช้ Direct connection (db.<ref>.supabase.co:5432) สำหรับ pg_dump ไม่ใช่ pooler" }

$out = [IO.Path]::GetFullPath($OutDir)
if ($out.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw "ห้ามเก็บ backup ใน repo ($out)" }
New-Item -ItemType Directory -Force $out | Out-Null
# Only the current Windows user may read the backups (removes inherited access, e.g. other local users)
& icacls.exe $out /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "could not restrict permissions on $out" }

$user = [Uri]::UnescapeDataString($uri.UserInfo.Split(':')[0])
$env:PGPASSWORD = [Uri]::UnescapeDataString($uri.UserInfo.Substring($uri.UserInfo.IndexOf(':') + 1))
$env:PGSSLMODE = if ($uri.Host -in @("localhost", "127.0.0.1")) { "disable" } else { "require" } # Supabase requires SSL
$db = $uri.AbsolutePath.TrimStart('/'); if (-not $db) { $db = "postgres" }
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
try {
  $serverVersion = (& "$PgBin\psql.exe" -h $uri.Host -p $port -U $user -d $db -At -c "show server_version").Trim()
  $clientVersion = (& "$PgBin\pg_dump.exe" --version)
  Write-Host "server $serverVersion · $clientVersion"
  if ($clientVersion -notmatch " $($serverVersion.Split('.')[0])\.") { throw "pg_dump ต้องเป็นเวอร์ชันหลักเดียวกับ server ($serverVersion)" }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $file = Join-Path $out "$stamp-public-storage.dump"
  # public = ข้อมูลแอปทั้งหมด · storage = metadata ของรูป (ไฟล์รูปจริงอยู่ใน Storage ไม่ถูก migration แตะ)
  & "$PgBin\pg_dump.exe" -h $uri.Host -p $port -U $user -d $db --schema=public --schema=storage --no-owner --no-privileges -Fc -f $file
  if ($LASTEXITCODE -ne 0) { throw "pg_dump ล้มเหลว (exit $LASTEXITCODE)" }

  & "$PgBin\pg_restore.exe" --list $file > "$file.list"
  if ($LASTEXITCODE -ne 0) { throw "เปิดไฟล์ dump ไม่ได้" }
  $hash = (Get-FileHash $file -Algorithm SHA256).Hash
  "$hash  $(Split-Path $file -Leaf)" | Set-Content -Encoding ascii "$file.sha256"
  $tables = (Select-String -Path "$file.list" -Pattern ' TABLE DATA public ').Count
  Write-Host "สำเร็จ: $file ($([Math]::Round((Get-Item $file).Length / 1KB)) KB · TABLE DATA public = $tables · SHA256 $($hash.Substring(0, 12))…)"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
