# =========================================================
# Apply reviewed SQL files to the database in backend/.env, one by one, and stop at the first problem.
# Manual use only, after the matching approval gate. Writes to the database.
#
#   powershell -File backend/scripts/apply-production-sql.ps1 -ConfirmHost db.<ref>.supabase.co `
#     -Files database/migrations/001_admin_workflow.sql,database/migrations/002_notifications_announcements.sql,database/verification/verify-production-migration.sql `
#     -PsqlVars "approved=4,requests=12,pets=46,profiles=10,favorites=19"
#
# - The hostname must be typed and match DATABASE_URL (protects against the wrong database)
# - Password goes through PGPASSWORD for this process only (never on the command line, never printed)
# - psql runs with ON_ERROR_STOP=1; every migration file is its own begin…commit (a failure leaves no partial change)
# - Any output row ending in ok = false (verification files) stops the run
# =========================================================
param(
  [Parameter(Mandatory = $true)][string]$ConfirmHost,
  [Parameter(Mandatory = $true)][string[]]$Files,
  [string]$PsqlVars = "",
  [string]$PgBin = "C:\Program Files\PostgreSQL\17\bin",
  [string]$EnvFile = ""
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = if ($EnvFile) { $EnvFile } else { Join-Path $repo "backend\.env" }
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL not found in $envFile" }
$uri = [Uri](($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"'))
if ($uri.Host -ne $ConfirmHost) { throw "hostname mismatch: DATABASE_URL points to $($uri.Host.Substring(0, [Math]::Min(9, $uri.Host.Length)))…, you confirmed $ConfirmHost" }
if ($uri.Host -match 'pooler') { throw "use the Direct connection (db.<ref>.supabase.co:5432) for migrations, not the pooler" }

$Files = @($Files | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { (Resolve-Path (Join-Path $repo $_)).Path })
$vars = @(); foreach ($v in ($PsqlVars.Split(",") | Where-Object { $_ })) { $vars += @("-v", $v.Trim()) }
$user = [Uri]::UnescapeDataString($uri.UserInfo.Split(':')[0])
$env:PGPASSWORD = [Uri]::UnescapeDataString($uri.UserInfo.Substring($uri.UserInfo.IndexOf(':') + 1))
$env:PGSSLMODE = if ($uri.Host -in @("localhost", "127.0.0.1")) { "disable" } else { "require" }
$env:PGOPTIONS = "-c client_min_messages=warning" # hide "already exists, skipping" notices of idempotent files
$db = $uri.AbsolutePath.TrimStart('/'); if (-not $db) { $db = "postgres" }
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
try {
  foreach ($file in $Files) {
    $name = Split-Path $file -Leaf
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $ErrorActionPreference = "Continue"
    $output = & "$PgBin\psql.exe" -h $uri.Host -p $port -U $user -d $db -X -q -v ON_ERROR_STOP=1 -At -F "|" @vars -f $file 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    $bad = @($output | Where-Object { $_ -match '\|f$' })
    Write-Host ("{0}: exit {1} · {2} ms · {3} failing check(s)" -f $name, $code, $watch.ElapsedMilliseconds, $bad.Count)
    $output | Where-Object { $_ -match 'ERROR|NOTICE|\|[tf]$' } | ForEach-Object { Write-Host ("    " + $_.Substring(0, [Math]::Min(170, $_.Length))) }
    if ($code -ne 0) { Write-Host "STOP: $name failed — nothing after it was run"; exit 1 }
    if ($bad.Count) { Write-Host "STOP: $name has failing checks — nothing after it was run"; exit 1 }
  }
  Write-Host "ALL FILES APPLIED AND VERIFIED"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
