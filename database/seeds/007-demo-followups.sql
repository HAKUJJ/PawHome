-- =========================================================
-- PawHome demo dataset pawhome-demo-v1 (v1.0.0) — บันทึกติดตามของผู้ดูแล
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: 007-demo-followups.sql
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
insert into public.adoption_follow_ups (id, request_id, kind, note, actor_id, created_at)
select v.id, v.request_id, v.kind, v.note, u.id, a.t - make_interval(mins => v.m)
from (values
  (930001, 3001, 'VERIFY', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 'demo-02.admin.nok@pawhome.test', 123969),
  (930002, 3002, 'CLOSE', 'ปิดเคสหลังรับเลี้ยงสำเร็จ', 'demo-03.admin.ton@pawhome.test', 27148),
  (930003, 3007, 'VERIFY', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 'demo-02.admin.nok@pawhome.test', 23057),
  (930004, 3010, 'CLOSE', 'ปิดเคสหลังรับเลี้ยงสำเร็จ', 'demo-03.admin.ton@pawhome.test', 51470),
  (930005, 3013, 'VERIFY', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 'demo-02.admin.nok@pawhome.test', 40717),
  (930006, 3019, 'VERIFY', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 'demo-02.admin.nok@pawhome.test', 54936),
  (930007, 3019, 'CLOSE', 'ปิดเคสหลังรับเลี้ยงสำเร็จ', 'demo-03.admin.ton@pawhome.test', 52501),
  (930008, 3020, 'NOTE', 'รอเอกสารเพิ่มเติม: ขอรูปถ่ายวันส่งมอบจากทั้งสองฝ่าย', 'demo-02.admin.nok@pawhome.test', 68166),
  (930009, 3020, 'CONTACT', 'โทรคุยทั้งสองฝ่ายแล้ว ผู้ขอกรอกวันที่ผิด', 'demo-02.admin.nok@pawhome.test', 67913),
  (930010, 3020, 'VERIFY', 'ตรวจรูปถ่ายวันส่งมอบและโทรยืนยันทั้งสองฝ่ายแล้ว', 'demo-02.admin.nok@pawhome.test', 65738),
  (930011, 3022, 'NOTE', 'รอเอกสารเพิ่มเติม: ขอรูปถ่ายวันส่งมอบจากทั้งสองฝ่าย', 'demo-03.admin.ton@pawhome.test', 35952),
  (930012, 3022, 'CONTACT', 'โทรคุยทั้งสองฝ่ายแล้ว ผู้ขอกรอกวันที่ผิด', 'demo-03.admin.ton@pawhome.test', 35143),
  (930013, 3022, 'VERIFY', 'ตรวจรูปถ่ายวันส่งมอบและโทรยืนยันทั้งสองฝ่ายแล้ว', 'demo-03.admin.ton@pawhome.test', 33416),
  (930014, 3025, 'CONTACT', 'โทรหาเจ้าของแล้ว รอยืนยันวันส่งมอบจริง', 'demo-02.admin.nok@pawhome.test', 113941),
  (930015, 3027, 'CONTACT', 'โทรหาเจ้าของแล้ว รอยืนยันวันส่งมอบจริง', 'demo-03.admin.ton@pawhome.test', 111104),
  (930016, 3033, 'CONTACT', 'เตือนผู้ขอให้รายงานการรับน้องในระบบ', 'demo-02.admin.nok@pawhome.test', 46115),
  (930017, 3034, 'CONTACT', 'เตือนผู้ขอให้รายงานการรับน้องในระบบ', 'demo-03.admin.ton@pawhome.test', 94876),
  (930018, 3042, 'CONTACT', 'ติดต่อผู้ขอไม่สำเร็จ โทร 2 ครั้งไม่รับสาย', 'demo-02.admin.nok@pawhome.test', 55770),
  (930019, 3043, 'NOTE', 'ข้อมูลไม่ตรงกันเรื่องวันส่งมอบ รอหลักฐานเพิ่ม', 'demo-03.admin.ton@pawhome.test', 83010),
  (930020, 3043, 'ESCALATE', 'ส่งต่อหัวหน้าทีมตรวจสอบ', 'demo-03.admin.ton@pawhome.test', 82423),
  (930021, 3045, 'NOTE', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 'demo-02.admin.nok@pawhome.test', 26439),
  (930022, 3050, 'NOTE', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 'demo-02.admin.nok@pawhome.test', 103193),
  (930023, 3055, 'NOTE', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 'demo-02.admin.nok@pawhome.test', 53653),
  (930024, 3060, 'NOTE', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 'demo-02.admin.nok@pawhome.test', 54958),
  (930025, 3099, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-02.admin.nok@pawhome.test', 1980),
  (930026, 3099, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 1260),
  (930027, 3099, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-02.admin.nok@pawhome.test', 360),
  (930028, 3102, 'CONTACT', 'โทรหาเจ้าของแล้ว ไม่รับสาย', 'demo-03.admin.ton@pawhome.test', 3180),
  (930029, 3102, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 2460),
  (930030, 3102, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-03.admin.ton@pawhome.test', 1560),
  (930031, 3102, 'ESCALATE', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 'demo-03.admin.ton@pawhome.test', 60),
  (930032, 3104, 'CONTACT', 'โทรหาเจ้าของแล้ว ไม่รับสาย', 'demo-02.admin.nok@pawhome.test', 7380),
  (930033, 3104, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 6660),
  (930034, 3104, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-02.admin.nok@pawhome.test', 5760),
  (930035, 3104, 'ESCALATE', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 'demo-02.admin.nok@pawhome.test', 4260),
  (930036, 3105, 'CONTACT', 'โทรหาเจ้าของแล้ว ไม่รับสาย', 'demo-03.admin.ton@pawhome.test', 9180),
  (930037, 3105, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 8460),
  (930038, 3105, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-03.admin.ton@pawhome.test', 7560),
  (930039, 3105, 'ESCALATE', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 'demo-03.admin.ton@pawhome.test', 6060),
  (930040, 3108, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-02.admin.nok@pawhome.test', 11580),
  (930041, 3108, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 10860),
  (930042, 3108, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-02.admin.nok@pawhome.test', 9960),
  (930043, 3108, 'ESCALATE', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 'demo-02.admin.nok@pawhome.test', 8460),
  (930044, 3110, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-03.admin.ton@pawhome.test', 15180),
  (930045, 3110, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 14460),
  (930046, 3110, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-03.admin.ton@pawhome.test', 13560),
  (930047, 3110, 'ESCALATE', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 'demo-03.admin.ton@pawhome.test', 12060),
  (930048, 3123, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-02.admin.nok@pawhome.test', 180),
  (930049, 3123, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 90),
  (930050, 3123, 'RESOLVE', 'เจ้าของแจ้งว่ากำลังคุยกับผู้ขอทางโทรศัพท์', 'demo-02.admin.nok@pawhome.test', 30),
  (930051, 3126, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-03.admin.ton@pawhome.test', 780),
  (930052, 3126, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 60),
  (930053, 3128, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-02.admin.nok@pawhome.test', 1680),
  (930054, 3128, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 960),
  (930055, 3128, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-02.admin.nok@pawhome.test', 60),
  (930056, 3129, 'CONTACT', 'ส่งข้อความหาเจ้าของแล้ว รอตอบกลับ', 'demo-03.admin.ton@pawhome.test', 2580),
  (930057, 3129, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 1860),
  (930058, 3129, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-03.admin.ton@pawhome.test', 960),
  (930059, 3144, 'CONTACT', 'ส่งข้อความหาเจ้าของแล้ว รอตอบกลับ', 'demo-02.admin.nok@pawhome.test', 180),
  (930060, 3144, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 90),
  (930061, 3144, 'RESOLVE', 'เจ้าของแจ้งว่ากำลังคุยกับผู้ขอทางโทรศัพท์', 'demo-02.admin.nok@pawhome.test', 30),
  (930062, 3146, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-03.admin.ton@pawhome.test', 780),
  (930063, 3146, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 60),
  (930064, 3147, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-02.admin.nok@pawhome.test', 1680),
  (930065, 3147, 'FLAG', '', 'demo-02.admin.nok@pawhome.test', 960),
  (930066, 3147, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-02.admin.nok@pawhome.test', 60),
  (930067, 3150, 'CONTACT', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 'demo-03.admin.ton@pawhome.test', 2580),
  (930068, 3150, 'FLAG', '', 'demo-03.admin.ton@pawhome.test', 1860),
  (930069, 3150, 'CONTACT', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 'demo-03.admin.ton@pawhome.test', 960),
  (930070, 3159, 'CLOSE', 'ปิดเคส: เจ้าของปฏิเสธพร้อมเหตุผลแล้ว', 'demo-02.admin.nok@pawhome.test', 90910)
) as v(id, request_id, kind, note, actor_email, m)
join auth.users u on u.email = v.actor_email
cross join a
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.adoption_follow_ups', 'id'), (select max(id) from public.adoption_follow_ups));
