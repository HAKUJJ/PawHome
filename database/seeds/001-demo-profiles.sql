-- =========================================================
-- PawHome demo dataset pawhome-demo-v1 (v1.0.0) — profiles + ผู้ดูแลทดสอบ + บัญชีที่ถูกระงับ
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: 001-demo-profiles.sql
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

-- profile สร้างโดย trigger on_auth_user_created อยู่แล้ว · เผื่อกรณี trigger ไม่ทำงาน
insert into public.profiles (id, name)
select u.id, v.name from (values
  ('demo-01.superadmin@pawhome.test', 'ผู้ดูแลสูงสุด (ทดสอบ)'),
  ('demo-02.admin.nok@pawhome.test', 'นก ผู้ดูแล (ทดสอบ)'),
  ('demo-03.admin.ton@pawhome.test', 'ต้น ผู้ดูแล (ทดสอบ)'),
  ('demo-04.shelter.sisa@pawhome.test', 'บ้านพักพิงสี่ขา (ทดสอบ)'),
  ('demo-05.rescue.paw@pawhome.test', 'กลุ่มช่วยน้องจรรอบเมือง (ทดสอบ)'),
  ('demo-06.owner.malee@pawhome.test', 'มาลี ใจดี'),
  ('demo-07.owner.somchai@pawhome.test', 'สมชาย เงียบขรึม'),
  ('demo-08.owner.pim@pawhome.test', 'พิมพ์ชนก แสงทอง'),
  ('demo-09.owner.krit@pawhome.test', 'กฤต วงศ์ประเสริฐ'),
  ('demo-10.owner.nida@pawhome.test', 'นิดา บุญมา'),
  ('demo-11.owner.arthit@pawhome.test', 'อาทิตย์ รุ่งเรือง'),
  ('demo-12.owner.kanya@pawhome.test', 'กัญญา ศรีสุข'),
  ('demo-13.owner.thana@pawhome.test', 'ธนา พึ่งบุญ'),
  ('demo-14.owner.ploy@pawhome.test', 'พลอย จันทร์เพ็ญ'),
  ('demo-15.owner.wut@pawhome.test', 'วุฒิ ทองดี'),
  ('demo-16.owner.fah@pawhome.test', 'ฟ้า ใสสะอาด'),
  ('demo-17.owner.beam@pawhome.test', 'บีม อินทร์แก้ว'),
  ('demo-18.owner.mint@pawhome.test', 'มิ้นท์ ชัยมงคล'),
  ('demo-19.owner.toey@pawhome.test', 'เตย ศักดิ์สิทธิ์'),
  ('demo-20.owner.golf@pawhome.test', 'กอล์ฟ ประเสริฐศรี'),
  ('demo-21.new.joy@pawhome.test', 'จอย มาใหม่'),
  ('demo-22.applicant.ning@pawhome.test', 'หนิง ขอรับเลี้ยง'),
  ('demo-23.fav.bow@pawhome.test', 'โบว์ รักหมาแมว'),
  ('demo-24.applicant.tee@pawhome.test', 'ตี๋ เปลี่ยนใจ'),
  ('demo-25.adopter.pop@pawhome.test', 'ป๊อป ได้น้องแล้ว'),
  ('demo-26.applicant.kwan@pawhome.test', 'ขวัญ ยังไม่ผ่าน'),
  ('demo-27.applicant.oat@pawhome.test', 'โอ๊ต สุขสบาย'),
  ('demo-28.applicant.aom@pawhome.test', 'ออม เก็บเงิน'),
  ('demo-29.applicant.big@pawhome.test', 'บิ๊ก ใจกว้าง'),
  ('demo-30.applicant.namwan@pawhome.test', 'น้ำหวาน หอมหวาน'),
  ('demo-31.applicant.tam@pawhome.test', 'ต้าม ร่าเริง'),
  ('demo-32.applicant.pang@pawhome.test', 'แป้ง นุ่มนวล'),
  ('demo-33.applicant.jack@pawhome.test', 'แจ็ค บ้านสวน'),
  ('demo-34.applicant.fern@pawhome.test', 'เฟิร์น ใบไม้'),
  ('demo-35.applicant.noon@pawhome.test', 'นุ่น ฟูฟ่อง'),
  ('demo-36.applicant.boss@pawhome.test', 'บอส คอนโดกลางเมือง'),
  ('demo-37.applicant.may@pawhome.test', 'เมย์ ดอกไม้'),
  ('demo-38.applicant.gun@pawhome.test', 'กันต์ ขยันงาน'),
  ('demo-39.suspended.x@pawhome.test', 'บัญชีถูกระงับ (ทดสอบ)'),
  ('demo-40.applicant.earn@pawhome.test', 'เอิร์น อบอุ่น')
) as v(email, name) join auth.users u on u.email = v.email
on conflict (id) do nothing;

-- ผู้ดูแลทดสอบ (Development เท่านั้น — ฐานข้อมูลที่ผ่าน guard ด้านบน)
insert into public.admin_memberships (user_id, role, granted_by)
select u.id, v.role, g.id from (values
  ('demo-01.superadmin@pawhome.test', 'SUPER_ADMIN', null::text),
  ('demo-02.admin.nok@pawhome.test', 'ADMIN', 'demo-01.superadmin@pawhome.test'),
  ('demo-03.admin.ton@pawhome.test', 'ADMIN', 'demo-01.superadmin@pawhome.test')
) as v(email, role, granted_by) join auth.users u on u.email = v.email left join auth.users g on g.email = v.granted_by
on conflict (user_id) do nothing;

insert into public.user_suspensions (user_id, reason, suspended_by)
select u.id, 'บัญชีทดสอบสำหรับสถานะถูกระงับ (ข้อมูลตัวอย่าง)', s.id from auth.users u, auth.users s
where u.email = 'demo-39.suspended.x@pawhome.test' and s.email = 'demo-01.superadmin@pawhome.test'
on conflict (user_id) do nothing;
