-- =========================================================
-- PawHome — Migration 004: simplify admin (university final project scope)
-- Drops two tables the code no longer uses:
--   admin_audit_logs  (detailed admin audit trail + append-only trigger/function)
--   user_suspensions  (account suspension)
-- Kept: admin_memberships, adoption_stage_history (timeline), adoption_follow_ups (admin notes/flags),
--       adoption_handover_reports, notification_events, announcements, _prisma_migrations (untouched)
--
-- Run only AFTER the backend that no longer reads these tables is deployed.
-- Refuses to run if either table holds rows (archive them first, see the note below) — no silent data loss.
-- Rollback: 004_simplify_admin.rollback.sql (recreates both tables empty, same definitions as 001)
-- =========================================================
begin;

do $$
declare
  audit_rows bigint := 0;
  suspension_rows bigint := 0;
begin
  if to_regclass('public.admin_audit_logs') is not null then
    execute 'select count(*) from public.admin_audit_logs' into audit_rows;
  end if;
  if to_regclass('public.user_suspensions') is not null then
    execute 'select count(*) from public.user_suspensions' into suspension_rows;
  end if;
  -- Archive first if needed:  create table public.archive_admin_audit_logs as table public.admin_audit_logs;
  if audit_rows > 0 or suspension_rows > 0 then
    raise exception 'refusing to drop: admin_audit_logs has % row(s), user_suspensions has % row(s) — archive them first', audit_rows, suspension_rows;
  end if;
end;
$$;

drop trigger if exists admin_audit_logs_append_only on public.admin_audit_logs;
drop trigger if exists admin_audit_logs_no_truncate on public.admin_audit_logs;
drop table if exists public.admin_audit_logs;
drop function if exists public.reject_audit_log_change();
drop table if exists public.user_suspensions;

commit;
