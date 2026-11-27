-- =========================================================
-- PawHome — Preflight ก่อนรัน migration 001 บน Production (อ่านอย่างเดียว · ไม่เขียน ไม่ล็อกตาราง)
-- รันใน SQL Editor หรือ: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "begin read only" -f preflight-production.sql
-- severity = blocker → ต้อง ok = true ทุกแถวก่อนรัน 001 · info → ข้อมูลประกอบการตัดสินใจ (ok = true เสมอ)
-- =========================================================
with
req as (select * from public.adoption_requests),
approved as (select pet_id, count(*) as n from req where status = 'APPROVED' group by pet_id),
checks (ord, severity, check_name, expected, actual, ok) as (
  -- ---------- สิ่งที่ migration 001 ต้องพึ่ง ----------
  select 1, 'blocker', 'function public.set_updated_at exists', 'true',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_updated_at')::text,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_updated_at')
  union all
  select 2, 'blocker', 'roles anon + authenticated exist', '2',
    (select count(*) from pg_roles where rolname in ('anon', 'authenticated'))::text,
    (select count(*) from pg_roles where rolname in ('anon', 'authenticated')) = 2
  union all
  select 3, 'blocker', 'function auth.uid exists (RLS policies)', 'true',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid')::text,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid')
  union all
  select 4, 'blocker', 'index adoption_requests_one_approved_per_pet exists', 'true',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'adoption_requests_one_approved_per_pet')::text,
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'adoption_requests_one_approved_per_pet')

  -- ---------- ข้อมูลเดิมที่ backfill ต้อง map ได้ ----------
  union all
  select 10, 'blocker', 'requests with unknown status (not PENDING/APPROVED/REJECTED/CANCELLED)', '0',
    (select count(*) from req where status not in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))::text,
    (select count(*) from req where status not in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')) = 0
  union all
  select 11, 'blocker', 'requests with null created_at/updated_at (idle timer source)', '0',
    (select count(*) from req where created_at is null or updated_at is null)::text,
    (select count(*) from req where created_at is null or updated_at is null) = 0
  union all
  select 12, 'blocker', 'pets with more than one APPROVED request', '0',
    (select count(*) from approved where n > 1)::text,
    (select count(*) from approved where n > 1) = 0
  union all
  select 13, 'blocker', 'requests pointing to a missing pet or profile', '0',
    (select count(*) from req r where not exists (select 1 from public.pets p where p.id = r.pet_id)
                                 or not exists (select 1 from public.profiles u where u.id = r.user_id))::text,
    (select count(*) from req r where not exists (select 1 from public.pets p where p.id = r.pet_id)
                                 or not exists (select 1 from public.profiles u where u.id = r.user_id)) = 0
  union all
  select 14, 'blocker', 'pets with unknown status (not AVAILABLE/PENDING/ADOPTED)', '0',
    (select count(*) from public.pets where status not in ('AVAILABLE', 'PENDING', 'ADOPTED'))::text,
    (select count(*) from public.pets where status not in ('AVAILABLE', 'PENDING', 'ADOPTED')) = 0

  -- ---------- สถานะ migration ปัจจุบัน ----------
  union all
  select 20, 'info', 'migration 001 applied (adoption_requests.stage)', 'false before rollout',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'adoption_requests' and column_name = 'stage')::text, true
  union all
  select 21, 'info', 'migration 002 applied (announcements.publish_at)', 'false before rollout',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcements' and column_name = 'publish_at')::text, true
  union all
  select 22, 'info', 'migration 003 applied (stage/status constraint)', 'false before rollout',
    exists (select 1 from pg_constraint where conname = 'adoption_requests_stage_status_consistent')::text, true

  -- ---------- ผลที่ backfill จะสร้าง (ไม่มีแถวใดกลายเป็น COMPLETED) ----------
  union all
  select 30, 'info', 'requests PENDING / APPROVED / REJECTED', 'counts',
    (select concat_ws(' / ', count(*) filter (where status = 'PENDING'), count(*) filter (where status = 'APPROVED'), count(*) filter (where status = 'REJECTED')) from req), true
  union all
  select 31, 'info', 'APPROVED → ACCEPTED + legacy_review (admin must verify; never COMPLETED)', 'count',
    (select count(*) from req where status = 'APPROVED')::text, true
  union all
  select 32, 'info', 'pets ADOPTED without an APPROVED request (stay ADOPTED, no case created)', 'count',
    (select count(*) from public.pets p where p.status = 'ADOPTED' and not exists (select 1 from approved a where a.pet_id = p.id))::text, true
  union all
  select 33, 'info', 'pets with an APPROVED request but not ADOPTED', 'count',
    (select count(*) from public.pets p where p.status <> 'ADOPTED' and exists (select 1 from approved a where a.pet_id = p.id))::text, true
  union all
  select 34, 'info', 'profiles / pets / favorites', 'counts',
    concat_ws(' / ', (select count(*) from public.profiles), (select count(*) from public.pets), (select count(*) from public.favorites)), true

  -- ---------- ความปลอดภัย: ตาราง Prisma ที่ PostgREST เปิดให้ anon (แก้ด้วย 000_lock_prisma_migrations.sql) ----------
  union all
  select 35, 'info', '_prisma_migrations: privileges held by anon/authenticated (0 after 000)', '0',
    case when to_regclass('public._prisma_migrations') is null then 'no table' else
      (select count(*) from unnest(array['anon', 'authenticated']) r
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
       where has_table_privilege(r, 'public._prisma_migrations', p))::text end, true

  -- ---------- Storage ----------
  union all
  select 40, 'info', 'storage bucket pet-images (public)', 'true',
    coalesce((select public::text from storage.buckets where id = 'pet-images'), 'missing'), true
  union all
  select 41, 'info', 'objects in pet-images', 'count',
    (select count(*) from storage.objects where bucket_id = 'pet-images')::text, true
)
select severity, check_name, expected, actual, ok from checks order by ord;
