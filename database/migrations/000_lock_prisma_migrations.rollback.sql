-- ย้อนกลับ Migration 000 — คืนสิทธิ์เดิมของ Supabase ให้ anon/authenticated (เปิดช่องโหว่คืน · ใช้เฉพาะเมื่อจำเป็นจริง)
-- ไม่แตะแถวในตาราง
begin;

do $$
begin
  if to_regclass('public._prisma_migrations') is null then return; end if;
  execute 'alter table public._prisma_migrations disable row level security';
  execute 'grant all on table public._prisma_migrations to anon, authenticated';
end;
$$;

commit;
