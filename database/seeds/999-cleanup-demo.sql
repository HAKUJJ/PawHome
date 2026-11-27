-- =========================================================
-- PawHome demo dataset pawhome-demo-v1 (v1.0.0) — ลบเฉพาะชุดข้อมูลทดสอบนี้
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: 999-cleanup-demo.sql
-- =========================================================
do $$
begin
  if (select count(*) from auth.users where email like 'demo-%@pawhome.test') < 40 then
    raise exception 'ต้องมีบัญชี demo ครบ 40 บัญชีใน Supabase Auth ก่อน — รัน: cd backend && npm run seed:demo-users';
  end if;
  if exists (select 1 from public.pets p join auth.users u on u.id = p.owner_id where u.email not like '%@pawhome.test')
     or exists (select 1 from public.adoption_requests r join auth.users u on u.id = r.user_id where u.email not like '%@pawhome.test') then
    raise exception 'พบข้อมูลของผู้ใช้จริง — seed นี้ใช้กับฐานข้อมูล Development/Test ที่ไม่มีข้อมูลจริงเท่านั้น';
  end if;
end $$;

-- ลบเฉพาะแถวในช่วง id ของชุดข้อมูลนี้ที่เป็นของบัญชี demo-*@pawhome.test (ไม่ใช้ TRUNCATE / ไม่ลบทั้งตาราง)
-- คำขอ ไทม์ไลน์ รายงาน บันทึกติดตาม แจ้งเตือน รายการโปรด ถูกลบตาม FK (on delete cascade) ของน้อง/ประกาศ
-- ไม่ลบ: admin_audit_logs (append-only โดยออกแบบ — แยกด้วย changes.dataset) และบัญชีใน Supabase Auth (ลบผ่าน Dashboard/Admin API)
begin;
delete from public.pets p using auth.users u
where p.owner_id = u.id and u.email like 'demo-%@pawhome.test' and p.id between 2001 and 2100;
delete from public.announcements where id between 501 and 520 and is_demo in (true, false)
  and created_by in (select id from auth.users where email like 'demo-%@pawhome.test');
delete from public.notification_events n using auth.users u
where n.recipient_id = u.id and u.email like 'demo-%@pawhome.test' and n.id between 940001 and 949999;
delete from public.user_suspensions s using auth.users u where s.user_id = u.id and u.email like 'demo-%@pawhome.test';
delete from public.admin_memberships m using auth.users u where m.user_id = u.id and u.email like 'demo-%@pawhome.test';
commit;
