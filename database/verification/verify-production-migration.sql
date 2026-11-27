-- =========================================================
-- PawHome — Verify migrations on Production data (read-only · no test accounts needed)
-- Run after 001 + 002 (and again after 003). Every row must be ok = true.
-- Set the counts from preflight-production.sql taken right before the migration:
--   psql ... -v approved=4 -v requests=12 -v pets=46 -v profiles=10 -v favorites=19 -f verify-production-migration.sql
-- =========================================================
with
req as (select * from public.adoption_requests),
checks (check_name, expected, actual) as (
  -- ---------- data preserved ----------
  select 'adoption_requests row count unchanged', :'requests', (select count(*) from req)::text
  union all select 'pets row count unchanged', :'pets', (select count(*) from public.pets)::text
  union all select 'profiles row count unchanged', :'profiles', (select count(*) from public.profiles)::text
  union all select 'favorites row count unchanged', :'favorites', (select count(*) from public.favorites)::text

  -- ---------- legacy mapping: APPROVED → ACCEPTED + legacy_review, never COMPLETED ----------
  union all select 'no request became COMPLETED', '0', (select count(*) from req where stage = 'COMPLETED')::text
  union all select 'legacy APPROVED → ACCEPTED + legacy_review + follow_up', :'approved',
    (select count(*) from req where status = 'APPROVED' and stage = 'ACCEPTED' and legacy_review and follow_up_required)::text
  union all select 'PENDING requests stay PENDING (idle from created_at)', '0',
    (select count(*) from req where status = 'PENDING' and (stage <> 'PENDING' or last_activity_at <> created_at))::text
  union all select 'REJECTED requests → stage REJECTED', '0', (select count(*) from req where status = 'REJECTED' and stage <> 'REJECTED')::text
  union all select 'pets with a legacy request are still ADOPTED (not reopened)', '0',
    (select count(*) from public.pets p where p.status <> 'ADOPTED' and exists (select 1 from req r where r.pet_id = p.id and r.legacy_review))::text
  union all select 'every non-PENDING request has a SYSTEM history entry', '0',
    (select count(*) from req r where r.stage <> 'PENDING' and not exists
      (select 1 from public.adoption_stage_history h where h.request_id = r.id and h.actor_role = 'SYSTEM'))::text
  union all select 'all pets VISIBLE (no pre-moderation)', '0', (select count(*) from public.pets where visibility <> 'VISIBLE')::text

  -- ---------- schema ----------
  union all select 'new tables exist', '6', (select count(*) from pg_tables where schemaname = 'public' and tablename in
    ('admin_memberships', 'adoption_stage_history', 'adoption_handover_reports',
     'adoption_follow_ups', 'notification_events', 'announcements'))::text
  union all select 'migration 002: notification_events.payload + announcements.publish_at', '2', (select count(*) from information_schema.columns
    where table_schema = 'public' and ((table_name = 'notification_events' and column_name = 'payload') or (table_name = 'announcements' and column_name = 'publish_at')))::text
  union all select 'no admin accounts yet (bootstrap is a separate gate)', '0', (select count(*) from public.admin_memberships)::text

  -- ---------- security ----------
  union all select 'RLS enabled on every public table', '0', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)::text
  union all select 'anon cannot read admin tables (follow-ups / memberships / audit · suspensions until 004)', '0', (select count(*) from unnest(array[
    'public.admin_audit_logs', 'public.adoption_follow_ups', 'public.admin_memberships', 'public.user_suspensions']) t
    where to_regclass(t) is not null and has_table_privilege('anon', t, 'SELECT'))::text
  union all select 'authenticated cannot write stage / visibility / legacy_review directly', '0', (select count(*) from (values
    ('adoption_requests', 'stage'), ('adoption_requests', 'legacy_review'), ('pets', 'visibility')) v(t, c)
    where has_column_privilege('authenticated', 'public.' || v.t, v.c, 'UPDATE'))::text
  union all select '_prisma_migrations locked (000)', '0', case when to_regclass('public._prisma_migrations') is null then '0' else
    (select count(*) from unnest(array['anon','authenticated']) r
     cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege(r, 'public._prisma_migrations', p))::text end
)
select check_name, expected, actual, expected = actual as ok from checks;
