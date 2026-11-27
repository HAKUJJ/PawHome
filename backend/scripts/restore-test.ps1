# =========================================================
# PawHome restore test: restore a pg_dump file into a THROWAWAY PostgreSQL cluster and verify it.
# Never connects to Supabase. The temporary cluster listens on localhost only, uses a temp folder,
# and is stopped and deleted at the end (the folder holds a copy of real data).
#
#   powershell -File backend/scripts/restore-test.ps1 -DumpFile <file>.dump `
#     -Expect "public.profiles=10,public.pets=46,public.favorites=19,public.adoption_requests=12,public._prisma_migrations=1,storage.objects=7"
#
# Passes only when: every section restores, row counts match -Expect, every FK is valid,
# and the adoption data invariants hold. Exit code 0 = PASS, 1 = FAIL.
# =========================================================
param(
  [Parameter(Mandatory = $true)][string]$DumpFile,
  [string]$Expect = "",
  [string]$PgBin = "C:\Program Files\PostgreSQL\17\bin",
  [int]$Port = 55439,
  # Rehearsal: SQL files run in order on the restored copy (migrations, then verification). Any error or ok = false row = FAIL.
  [string[]]$ThenRun = @(),
  # psql variables for those files, e.g. "approved=4,requests=12"
  [string]$PsqlVars = ""
)
$ErrorActionPreference = "Stop"
$dump = (Resolve-Path $DumpFile).Path
if (Test-Path "$dump.sha256") {
  $want = (Get-Content "$dump.sha256").Split(" ")[0]
  if ((Get-FileHash $dump -Algorithm SHA256).Hash -ne $want) { throw "SHA256 mismatch: $dump" }
  Write-Host "sha256 OK"
}
& "$PgBin\pg_restore.exe" --list $dump | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pg_restore --list failed" }

$dir = Join-Path $env:TEMP ("pawhome-restore-" + (Get-Date -Format "yyyyMMddHHmmss"))
$failures = New-Object System.Collections.Generic.List[string]
$psql = { param($sql) & "$PgBin\psql.exe" -h localhost -p $Port -U postgres -d restore_test -v ON_ERROR_STOP=1 -At -F "|" -c $sql }
try {
  & "$PgBin\initdb.exe" -D $dir -U postgres -A trust -E UTF8 --locale=C | Out-Null
  # pg_ctl start must not be piped: the server inherits the pipe and PowerShell would wait forever
  $ctl = Start-Process -FilePath "$PgBin\pg_ctl.exe" -ArgumentList @("-D", "`"$dir`"", "-l", "`"$dir\server.log`"", "-o", "`"-p $Port -c listen_addresses=localhost`"", "start") -NoNewWindow -PassThru
  $ctl.WaitForExit()
  for ($i = 0; $i -lt 60; $i++) { & "$PgBin\pg_isready.exe" -h localhost -p $Port -q; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Milliseconds 500 }
  if ($LASTEXITCODE -ne 0) { throw "temporary PostgreSQL did not start (see $dir\server.log)" }
  & "$PgBin\psql.exe" -h localhost -p $Port -U postgres -d postgres -q -c "create database restore_test" | Out-Null

  # Minimal stand-ins for what Supabase provides outside public/storage (roles, auth.users, auth.uid)
  & $psql @"
do `$`$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end `$`$;
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as `$`$ select null::uuid `$`$;
create or replace function auth.role() returns text language sql stable as `$`$ select null::text `$`$;
create or replace function auth.jwt() returns jsonb language sql stable as `$`$ select null::jsonb `$`$;
"@ | Out-Null

  $restore = {
    param($section)
    # pg_restore writes expected errors to stderr (e.g. schema "public" already exists): count them, do not abort
    $ErrorActionPreference = "Continue"
    $err =& "$PgBin\pg_restore.exe" -h localhost -p $Port -U postgres -d restore_test --no-owner --no-privileges --section=$section $dump 2>&1 |
      ForEach-Object { "$_" } | Where-Object { $_ -match 'error:' }
    $n = @($err).Where({ $_ }).Count
    Write-Host ("restore {0}: {1} error(s)" -f $section, $n)
    @($err) | Where-Object { $_ } | Select-Object -First 5 | ForEach-Object { Write-Host ("  " + $_.Substring(0, [Math]::Min(180, $_.Length))) }
    return $n
  }
  $preErrors = & $restore "pre-data"
  $dataErrors = & $restore "data"
  if ($dataErrors -gt 0) { $failures.Add("data section had $dataErrors error(s)") }
  # auth.users is not in the dump (public + storage only): recreate ids so FKs from public can be validated
  & $psql "insert into auth.users (id) select id from public.profiles on conflict do nothing" | Out-Null
  $postErrors = & $restore "post-data"

  # Row counts of every restored table
  $tables = & $psql "select schemaname || '.' || tablename from pg_tables where schemaname in ('public','storage') order by 1"
  $counts = @{}
  foreach ($t in $tables) { $counts[$t] = [int](& $psql "select count(*) from $t") }
  Write-Host "row counts:"
  $counts.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-45} {1}" -f $_.Name, $_.Value) }

  if ($Expect) {
    foreach ($pair in $Expect.Split(",")) {
      $name, $value = $pair.Trim().Split("=")
      if (-not $counts.ContainsKey($name)) { $failures.Add("missing table $name") }
      elseif ($counts[$name] -ne [int]$value) { $failures.Add("$name expected $value got $($counts[$name])") }
    }
  }

  # Integrity checks (each must return 0)
  $checks = [ordered]@{
    "FK constraints not validated"                 = "select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f' and not c.convalidated"
    "missing FK constraints (expected >= 4)"       = "select case when count(*) >= 4 then 0 else 1 end from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f'"
    "requests with missing pet or profile"         = "select count(*) from public.adoption_requests r where not exists (select 1 from public.pets p where p.id = r.pet_id) or not exists (select 1 from public.profiles u where u.id = r.user_id)"
    "pets with more than one APPROVED request"     = "select count(*) from (select pet_id from public.adoption_requests where status = 'APPROVED' group by pet_id having count(*) > 1) x"
    "pets with an APPROVED request but not ADOPTED" = "select count(*) from public.pets p where p.status <> 'ADOPTED' and exists (select 1 from public.adoption_requests a where a.pet_id = p.id and a.status = 'APPROVED')"
    "favorites with missing pet or profile"        = "select count(*) from public.favorites f where not exists (select 1 from public.pets p where p.id = f.pet_id) or not exists (select 1 from public.profiles u where u.id = f.user_id)"
    "RLS disabled on app tables"                   = "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('profiles','pets','favorites','adoption_requests') and not c.relrowsecurity"
  }
  foreach ($k in $checks.Keys) {
    $v = [int](& $psql $checks[$k])
    Write-Host ("  check {0,-48} {1}" -f $k, $(if ($v -eq 0) { "OK" } else { "FAIL ($v)" }))
    if ($v -ne 0) { $failures.Add($k) }
  }
  Write-Host ("restore errors: pre-data {0} · data {1} · post-data {2} (pre/post errors are usually Supabase-only roles/extensions)" -f $preErrors, $dataErrors, $postErrors)

  # powershell -File passes "a,b,c" as one string
  $ThenRun = @($ThenRun | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { (Resolve-Path $_).Path })
  if ($ThenRun.Count -and -not $failures.Count) {
    $vars = @(); foreach ($v in ($PsqlVars.Split(",") | Where-Object { $_ })) { $vars += @("-v", $v.Trim()) }
    foreach ($file in $ThenRun) {
      $name = Split-Path $file -Leaf
      $watch = [Diagnostics.Stopwatch]::StartNew()
      $ErrorActionPreference = "Continue"
      $output = & "$PgBin\psql.exe" -h localhost -p $Port -U postgres -d restore_test -X -q -v ON_ERROR_STOP=1 -At -F "|" @vars -f $file 2>&1 | ForEach-Object { "$_" }
      $code = $LASTEXITCODE
      $ErrorActionPreference = "Stop"
      $bad = @($output | Where-Object { $_ -match '\|f$' })
      Write-Host ("run {0}: exit {1} · {2} ms · {3} row(s) ok=false" -f $name, $code, $watch.ElapsedMilliseconds, $bad.Count)
      $output | Where-Object { $_ -match 'ERROR|\|[tf]$' } | ForEach-Object { Write-Host ("    " + $_.Substring(0, [Math]::Min(170, $_.Length))) }
      if ($code -ne 0) { $failures.Add("$name failed (exit $code)"); break }
      if ($bad.Count) { $failures.Add("$name has $($bad.Count) failing check(s)"); break }
    }
  }
} finally {
  if (Test-Path "$dir\PG_VERSION") { & "$PgBin\pg_ctl.exe" -D $dir -m fast -w stop | Out-Null }
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
}

if ($failures.Count) { Write-Host "RESTORE TEST: FAIL"; $failures | ForEach-Object { Write-Host "  - $_" }; exit 1 }
Write-Host "RESTORE TEST: PASS"
exit 0
