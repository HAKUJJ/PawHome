-- =========================================================
-- PawHome demo dataset pawhome-demo-v1 (v1.0.0) — ประกาศ 12 รายการ (3 รายการเดิมของหน้าแรก + ตัวอย่าง)
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: 008-demo-announcements.sql
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
do $$
begin
  if not exists (select 1 from public.pets where id = 2001) then
    raise exception 'ยังไม่มีน้อง id 2001 (จุดยึดเวลา) — รัน 002-demo-pets.sql ก่อน';
  end if;
end $$;

with a as (select created_at + make_interval(mins => 136800) as t from public.pets where id = 2001)
insert into public.announcements (id, title, category, description, event_date, event_time, location, contact, cta, destination, image_url,
  status, display_order, is_demo, published_at, publish_at, expire_at, created_by, updated_by, created_at, updated_at)
select v.id, v.title, v.category, v.description, (a.t + make_interval(days => v.event_days))::date, v.event_time, v.location, v.contact, v.cta,
  v.destination, '', v.status, v.display_order, v.is_demo, a.t - make_interval(mins => v.published_m),
  case when v.publish_in_m is null then null else a.t + make_interval(mins => v.publish_in_m) end,
  a.t - make_interval(mins => v.expired_m), u.id, u.id, a.t - make_interval(mins => v.created_m), a.t - make_interval(mins => v.created_m)
from (values
  (501, 'ฉีดวัคซีนพิษสุนัขบ้าฟรี', 'ประชาสัมพันธ์', 'พาน้องหมาแมวอายุ 3 เดือนขึ้นไปมาฉีดวัคซีนพิษสุนัขบ้าฟรี ลงทะเบียนหน้างานตามลำดับคิว ไม่ต้องจองล่วงหน้า', null::int, '', '', '', 'ดูรายละเอียด', '/announcements/rabies-vaccine', 'PUBLISHED', 1, false, 28800, null::int, null::int, 30240, 'demo-02.admin.nok@pawhome.test'),
  (502, 'บริจาคอาหารให้น้องในมูลนิธิ', 'ร่วมช่วยเหลือ', 'อาหารสุนัข อาหารแมว ทรายแมว ผ้าห่ม และอุปกรณ์ดูแลสัตว์ ช่วยน้องที่ยังรอบ้านได้ทุกตัว แจ้งความประสงค์แล้วนัดวันส่งของ', null::int, 'ทุกวัน 09:00–17:00 น.', '', '', 'วิธีบริจาค', '/support/donate-food', 'PUBLISHED', 2, false, 25920, null::int, null::int, 27360, 'demo-03.admin.ton@pawhome.test'),
  (503, 'ทำหมันราคาพิเศษสำหรับน้องจร', 'ผู้สนับสนุน', 'ลดจำนวนสัตว์จรเกิดใหม่ กับคลินิกพันธมิตรที่ให้ราคาพิเศษแก่ผู้ดูแลน้องจรและผู้รับเลี้ยงจาก PawHome', null::int, 'จันทร์–เสาร์ 09:00–17:00 น.', '', '', 'จองคิว', '/partners/spay-neuter', 'PUBLISHED', 3, false, 23040, null::int, null::int, 24480, 'demo-02.admin.nok@pawhome.test'),
  (504, '[ตัวอย่าง] ตลาดนัดรับเลี้ยงน้องหมาแมว', 'กิจกรรม', 'กิจกรรมสมมติสำหรับทดสอบระบบประกาศ — พบน้องจากบ้านพักพิงทดสอบ (ข้อมูลตัวอย่าง)', 14, '10:00–16:00', 'สถานที่สมมติ (ข้อมูลตัวอย่าง)', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'ดูน้องทั้งหมด', '/pets', 'PUBLISHED', 4, true, 7200, null::int, null::int, 8640, 'demo-03.admin.ton@pawhome.test'),
  (505, '[ตัวอย่าง] อาสาสมัครพาน้องเดินเล่นวันเสาร์', 'ร่วมช่วยเหลือ', 'ประกาศสมมติ — รับอาสาสมัครพาน้องในบ้านพักพิงทดสอบเดินเล่น (ข้อมูลตัวอย่าง)', 7, '08:00–10:00', 'สถานที่สมมติ (ข้อมูลตัวอย่าง)', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'ดูรายละเอียด', '/guide', 'PUBLISHED', 5, true, 4320, null::int, null::int, 5760, 'demo-02.admin.nok@pawhome.test'),
  (506, '[ตัวอย่าง] ข่าวสาร: วิธีเตรียมบ้านก่อนรับน้อง', 'ข่าวสาร', 'บทความสมมติ — เช็กลิสต์อุปกรณ์และการเตรียมพื้นที่ก่อนรับเลี้ยง (ข้อมูลตัวอย่าง)', null::int, '', '', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'อ่านคู่มือ', '/guide', 'PUBLISHED', 6, true, 2880, null::int, null::int, 3060, 'demo-03.admin.ton@pawhome.test'),
  (507, '[ตัวอย่าง] ผู้สนับสนุนอาหารประจำเดือน', 'ผู้สนับสนุน', 'ประกาศสมมติ — ขอบคุณผู้สนับสนุนทดสอบ (ไม่ใช่บริษัทจริง)', null::int, '', '', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'ดูรายละเอียด', '/', 'PUBLISHED', 7, true, 57600, null::int, 14400, 59040, 'demo-02.admin.nok@pawhome.test'),
  (508, '[ตัวอย่าง] กิจกรรมตรวจสุขภาพน้องฟรี (หมดเขตแล้ว)', 'กิจกรรม', 'กิจกรรมสมมติที่หมดเขตแล้ว ใช้ทดสอบประกาศหมดอายุ (ข้อมูลตัวอย่าง)', -20, '09:00–15:00', 'สถานที่สมมติ (ข้อมูลตัวอย่าง)', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'ดูรายละเอียด', '/', 'PUBLISHED', 8, true, 43200, null::int, 21600, 44640, 'demo-03.admin.ton@pawhome.test'),
  (509, '[ตัวอย่าง] เปิดรับบ้านอุปถัมภ์ชั่วคราว (ตั้งเวลา)', 'ประชาสัมพันธ์', 'ประกาศสมมติที่ตั้งเวลาเผยแพร่ล่วงหน้า (ข้อมูลตัวอย่าง)', 21, '', '', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'ดูรายละเอียด', '/pets', 'PUBLISHED', 9, true, null::int, 7200, null::int, 1440, 'demo-02.admin.nok@pawhome.test'),
  (510, '[ร่าง] สรุปยอดรับเลี้ยงประจำเดือน', 'ข่าวสาร', 'ฉบับร่าง ยังไม่เผยแพร่ (ข้อมูลตัวอย่าง)', null::int, '', '', '', 'อ่านต่อ', '/', 'DRAFT', 10, true, null::int, null::int, null::int, 720, 'demo-03.admin.ton@pawhome.test'),
  (511, '[ร่าง] เวิร์กช็อปฝึกน้องเบื้องต้น', 'กิจกรรม', 'ฉบับร่าง ยังไม่เผยแพร่ (ข้อมูลตัวอย่าง)', 30, '13:00–16:00', 'สถานที่สมมติ (ข้อมูลตัวอย่าง)', 'ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง', 'ดูรายละเอียด', '/guide', 'DRAFT', 11, true, null::int, null::int, null::int, 2880, 'demo-02.admin.nok@pawhome.test'),
  (512, '[ร่าง] ขอบคุณอาสาสมัคร', 'ประชาสัมพันธ์', 'ฉบับร่าง ยังไม่เผยแพร่ (ข้อมูลตัวอย่าง)', null::int, '', '', '', 'อ่านต่อ', '/', 'DRAFT', 12, true, null::int, null::int, null::int, 4320, 'demo-03.admin.ton@pawhome.test')
) as v(id, title, category, description, event_days, event_time, location, contact, cta, destination, status, display_order, is_demo,
       published_m, publish_in_m, expired_m, created_m, author_email)
join auth.users u on u.email = v.author_email
cross join a
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.announcements', 'id'), (select max(id) from public.announcements));
