-- =========================================================
-- PawHome — Migration 000 (Security hotfix): ปิดตาราง public._prisma_migrations จาก PostgREST
-- ปัญหา (ตรวจบน Production 27 พ.ย. 2026 แบบอ่านอย่างเดียว):
--   ตารางนี้ได้ default grant ของ Supabase → anon / authenticated มีสิทธิ์ SELECT INSERT UPDATE DELETE TRUNCATE
--   และไม่มี RLS → ใครก็ได้ที่มี anon key อ่าน/แก้/ลบประวัติ migration ผ่าน /rest/v1/_prisma_migrations
-- ไฟล์นี้:
--   - ไม่แตะแถวใด ๆ ในตาราง (ประวัติ migration คงเดิมทุกตัวอักษร)
--   - ไม่เปลี่ยนสิทธิ์ของ postgres (เจ้าของตาราง = role ที่ Backend/Prisma ใช้) และ service_role
--   - รันซ้ำได้ · รันก่อน 001 ได้ทันที (อิสระจาก 001–003) · ไม่มีตาราง = ไม่ทำอะไร
-- ย้อนกลับ: 000_lock_prisma_migrations.rollback.sql (ไม่แนะนำ: เปิดช่องโหว่คืน)
-- =========================================================
begin;

do $$
begin
  if to_regclass('public._prisma_migrations') is null then
    raise notice '_prisma_migrations ไม่มีในฐานข้อมูลนี้ — ข้าม';
    return;
  end if;
  execute 'revoke all on table public._prisma_migrations from anon, authenticated';
  -- RLS ไม่มี policy = role ที่ไม่ใช่เจ้าของ/bypassrls อ่านไม่ได้แม้มีคนเผลอ grant คืนภายหลัง
  execute 'alter table public._prisma_migrations enable row level security';
end;
$$;

-- ตรวจผลทันที: ต้องได้ 0 (ถ้าไม่ใช่ ธุรกรรมนี้ถูกยกเลิกทั้งหมด)
do $$
declare
  leaked int;
begin
  if to_regclass('public._prisma_migrations') is null then return; end if;
  select count(*) into leaked
  from unnest(array['anon', 'authenticated']) as r(role)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p(priv)
  where has_table_privilege(r.role, 'public._prisma_migrations', p.priv);
  if leaked > 0 then
    raise exception 'ยังมีสิทธิ์ค้าง % รายการบน _prisma_migrations', leaked;
  end if;
end;
$$;

commit;
