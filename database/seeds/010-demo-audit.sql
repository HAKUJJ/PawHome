-- =========================================================
-- PawHome demo dataset pawhome-demo-v1 (v1.0.0) — Audit log ของผู้ดูแลทดสอบ
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: 010-demo-audit.sql
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

-- ติดป้าย changes.dataset = 'pawhome-demo-v1' ทุกแถว เพื่อแยกจากประวัติการดำเนินการจริง
-- admin_audit_logs เป็น append-only: สคริปต์ลบชุดข้อมูล (999) ลบแถวเหล่านี้ไม่ได้โดยออกแบบ
with a as (select created_at + make_interval(mins => 136800) as t from public.pets where id = 2001)
insert into public.admin_audit_logs (id, actor_id, actor_role, action, target_type, target_id, result, changes, reason, created_at)
select v.id, u.id, coalesce(m.role, 'ADMIN'), v.action, v.target_type,
  case when v.target_type = 'user' then coalesce((select id::text from auth.users where email = v.target), v.target) else v.target end,
  'SUCCESS', v.changes::jsonb || jsonb_build_object('dataset', 'pawhome-demo-v1'), v.reason, a.t - make_interval(mins => v.m)
from (values
  (950001, 'demo-02.admin.nok@pawhome.test', 'adoption.verify', 'adoption_request', '3001', '{}', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 123969),
  (950002, 'demo-03.admin.ton@pawhome.test', 'adoption.close', 'adoption_request', '3002', '{}', 'ปิดเคสหลังรับเลี้ยงสำเร็จ', 27148),
  (950003, 'demo-02.admin.nok@pawhome.test', 'adoption.verify', 'adoption_request', '3007', '{}', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 23057),
  (950004, 'demo-03.admin.ton@pawhome.test', 'adoption.close', 'adoption_request', '3010', '{}', 'ปิดเคสหลังรับเลี้ยงสำเร็จ', 51470),
  (950005, 'demo-02.admin.nok@pawhome.test', 'adoption.verify', 'adoption_request', '3013', '{}', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 40717),
  (950006, 'demo-02.admin.nok@pawhome.test', 'adoption.verify', 'adoption_request', '3019', '{}', 'สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี', 54936),
  (950007, 'demo-03.admin.ton@pawhome.test', 'adoption.close', 'adoption_request', '3019', '{}', 'ปิดเคสหลังรับเลี้ยงสำเร็จ', 52501),
  (950008, 'demo-02.admin.nok@pawhome.test', 'adoption.note', 'adoption_request', '3020', '{}', 'รอเอกสารเพิ่มเติม: ขอรูปถ่ายวันส่งมอบจากทั้งสองฝ่าย', 68166),
  (950009, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3020', '{}', 'โทรคุยทั้งสองฝ่ายแล้ว ผู้ขอกรอกวันที่ผิด', 67913),
  (950010, 'demo-02.admin.nok@pawhome.test', 'adoption.verify', 'adoption_request', '3020', '{}', 'ตรวจรูปถ่ายวันส่งมอบและโทรยืนยันทั้งสองฝ่ายแล้ว', 65738),
  (950011, 'demo-03.admin.ton@pawhome.test', 'adoption.note', 'adoption_request', '3022', '{}', 'รอเอกสารเพิ่มเติม: ขอรูปถ่ายวันส่งมอบจากทั้งสองฝ่าย', 35952),
  (950012, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3022', '{}', 'โทรคุยทั้งสองฝ่ายแล้ว ผู้ขอกรอกวันที่ผิด', 35143),
  (950013, 'demo-03.admin.ton@pawhome.test', 'adoption.verify', 'adoption_request', '3022', '{}', 'ตรวจรูปถ่ายวันส่งมอบและโทรยืนยันทั้งสองฝ่ายแล้ว', 33416),
  (950014, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3025', '{}', 'โทรหาเจ้าของแล้ว รอยืนยันวันส่งมอบจริง', 113941),
  (950015, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3027', '{}', 'โทรหาเจ้าของแล้ว รอยืนยันวันส่งมอบจริง', 111104),
  (950016, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3033', '{}', 'เตือนผู้ขอให้รายงานการรับน้องในระบบ', 46115),
  (950017, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3034', '{}', 'เตือนผู้ขอให้รายงานการรับน้องในระบบ', 94876),
  (950018, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3042', '{}', 'ติดต่อผู้ขอไม่สำเร็จ โทร 2 ครั้งไม่รับสาย', 55770),
  (950019, 'demo-03.admin.ton@pawhome.test', 'adoption.note', 'adoption_request', '3043', '{}', 'ข้อมูลไม่ตรงกันเรื่องวันส่งมอบ รอหลักฐานเพิ่ม', 83010),
  (950020, 'demo-03.admin.ton@pawhome.test', 'adoption.escalate', 'adoption_request', '3043', '{}', 'ส่งต่อหัวหน้าทีมตรวจสอบ', 82423),
  (950021, 'demo-02.admin.nok@pawhome.test', 'adoption.note', 'adoption_request', '3045', '{}', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 26439),
  (950022, 'demo-02.admin.nok@pawhome.test', 'adoption.note', 'adoption_request', '3050', '{}', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 103193),
  (950023, 'demo-02.admin.nok@pawhome.test', 'adoption.note', 'adoption_request', '3055', '{}', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 53653),
  (950024, 'demo-02.admin.nok@pawhome.test', 'adoption.note', 'adoption_request', '3060', '{}', 'ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่', 54958),
  (950025, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3099', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 1980),
  (950026, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3099', '{}', '', 1260),
  (950027, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3099', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 360),
  (950028, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3102', '{}', 'โทรหาเจ้าของแล้ว ไม่รับสาย', 3180),
  (950029, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3102', '{}', '', 2460),
  (950030, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3102', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 1560),
  (950031, 'demo-03.admin.ton@pawhome.test', 'adoption.escalate', 'adoption_request', '3102', '{}', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 60),
  (950032, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3104', '{}', 'โทรหาเจ้าของแล้ว ไม่รับสาย', 7380),
  (950033, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3104', '{}', '', 6660),
  (950034, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3104', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 5760),
  (950035, 'demo-02.admin.nok@pawhome.test', 'adoption.escalate', 'adoption_request', '3104', '{}', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 4260),
  (950036, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3105', '{}', 'โทรหาเจ้าของแล้ว ไม่รับสาย', 9180),
  (950037, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3105', '{}', '', 8460),
  (950038, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3105', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 7560),
  (950039, 'demo-03.admin.ton@pawhome.test', 'adoption.escalate', 'adoption_request', '3105', '{}', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 6060),
  (950040, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3108', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 11580),
  (950041, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3108', '{}', '', 10860),
  (950042, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3108', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 9960),
  (950043, 'demo-02.admin.nok@pawhome.test', 'adoption.escalate', 'adoption_request', '3108', '{}', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 8460),
  (950044, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3110', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 15180),
  (950045, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3110', '{}', '', 14460),
  (950046, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3110', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 13560),
  (950047, 'demo-03.admin.ton@pawhome.test', 'adoption.escalate', 'adoption_request', '3110', '{}', 'เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน', 12060),
  (950048, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3123', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 180),
  (950049, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3123', '{}', '', 90),
  (950050, 'demo-02.admin.nok@pawhome.test', 'adoption.resolve', 'adoption_request', '3123', '{}', 'เจ้าของแจ้งว่ากำลังคุยกับผู้ขอทางโทรศัพท์', 30),
  (950051, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3126', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 780),
  (950052, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3126', '{}', '', 60),
  (950053, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3128', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 1680),
  (950054, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3128', '{}', '', 960),
  (950055, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3128', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 60),
  (950056, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3129', '{}', 'ส่งข้อความหาเจ้าของแล้ว รอตอบกลับ', 2580),
  (950057, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3129', '{}', '', 1860),
  (950058, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3129', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 960),
  (950059, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3144', '{}', 'ส่งข้อความหาเจ้าของแล้ว รอตอบกลับ', 180),
  (950060, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3144', '{}', '', 90),
  (950061, 'demo-02.admin.nok@pawhome.test', 'adoption.resolve', 'adoption_request', '3144', '{}', 'เจ้าของแจ้งว่ากำลังคุยกับผู้ขอทางโทรศัพท์', 30),
  (950062, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3146', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 780),
  (950063, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3146', '{}', '', 60),
  (950064, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3147', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 1680),
  (950065, 'demo-02.admin.nok@pawhome.test', 'adoption.flag', 'adoption_request', '3147', '{}', '', 960),
  (950066, 'demo-02.admin.nok@pawhome.test', 'adoption.contact', 'adoption_request', '3147', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 60),
  (950067, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3150', '{}', 'เจ้าของแจ้งว่าจะตอบภายในวันนี้', 2580),
  (950068, 'demo-03.admin.ton@pawhome.test', 'adoption.flag', 'adoption_request', '3150', '{}', '', 1860),
  (950069, 'demo-03.admin.ton@pawhome.test', 'adoption.contact', 'adoption_request', '3150', '{}', 'ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2', 960),
  (950070, 'demo-02.admin.nok@pawhome.test', 'adoption.close', 'adoption_request', '3159', '{}', 'ปิดเคส: เจ้าของปฏิเสธพร้อมเหตุผลแล้ว', 90910),
  (950071, 'demo-02.admin.nok@pawhome.test', 'pet.hide', 'pet', '2095', '{"visibility":{"to":"HIDDEN"}}', 'รายงานว่าโพสต์ซ้ำกับโพสต์อื่น', 99960),
  (950072, 'demo-03.admin.ton@pawhome.test', 'pet.hide', 'pet', '2096', '{"visibility":{"to":"HIDDEN"}}', 'ข้อมูลติดต่อในคำอธิบายไม่เหมาะสม', 74460),
  (950073, 'demo-02.admin.nok@pawhome.test', 'pet.request_changes', 'pet', '2097', '{"visibility":{"to":"CHANGES_REQUESTED"}}', 'รูปไม่ชัด กรุณาเพิ่มรูปน้องตัวจริง', 39720),
  (950074, 'demo-03.admin.ton@pawhome.test', 'pet.request_changes', 'pet', '2098', '{"visibility":{"to":"CHANGES_REQUESTED"}}', 'ข้อมูลวัคซีนไม่ครบ', 51720),
  (950075, 'demo-02.admin.nok@pawhome.test', 'pet.request_changes', 'pet', '2099', '{"visibility":{"to":"REVIEW"}}', 'เจ้าของแก้ไขแล้ว รอตรวจอีกครั้ง', 48300),
  (950076, 'demo-02.admin.nok@pawhome.test', 'pet.hide', 'pet', '2100', '{"visibility":{"to":"HIDDEN"}}', 'ตรวจสอบรายงาน', 31800),
  (950077, 'demo-02.admin.nok@pawhome.test', 'pet.show', 'pet', '2100', '{"visibility":{"to":"VISIBLE"}}', '', 30360),
  (950078, 'demo-02.admin.nok@pawhome.test', 'announcement.create', 'announcement', '501', '{"title":"ฉีดวัคซีนพิษสุนัขบ้าฟรี","status":"DRAFT"}', '', 30240),
  (950079, 'demo-02.admin.nok@pawhome.test', 'announcement.publish', 'announcement', '501', '{}', '', 28800),
  (950080, 'demo-03.admin.ton@pawhome.test', 'announcement.create', 'announcement', '502', '{"title":"บริจาคอาหารให้น้องในมูลนิธิ","status":"DRAFT"}', '', 27360),
  (950081, 'demo-03.admin.ton@pawhome.test', 'announcement.publish', 'announcement', '502', '{}', '', 25920),
  (950082, 'demo-02.admin.nok@pawhome.test', 'announcement.create', 'announcement', '503', '{"title":"ทำหมันราคาพิเศษสำหรับน้องจร","status":"DRAFT"}', '', 24480),
  (950083, 'demo-02.admin.nok@pawhome.test', 'announcement.publish', 'announcement', '503', '{}', '', 23040),
  (950084, 'demo-03.admin.ton@pawhome.test', 'announcement.create', 'announcement', '504', '{"title":"[ตัวอย่าง] ตลาดนัดรับเลี้ยงน้องหมาแมว","status":"DRAFT"}', '', 8640),
  (950085, 'demo-03.admin.ton@pawhome.test', 'announcement.publish', 'announcement', '504', '{}', '', 7200),
  (950086, 'demo-02.admin.nok@pawhome.test', 'announcement.create', 'announcement', '505', '{"title":"[ตัวอย่าง] อาสาสมัครพาน้องเดินเล่นวันเสาร์","status":"DRAFT"}', '', 5760),
  (950087, 'demo-02.admin.nok@pawhome.test', 'announcement.publish', 'announcement', '505', '{}', '', 4320),
  (950088, 'demo-03.admin.ton@pawhome.test', 'announcement.create', 'announcement', '506', '{"title":"[ตัวอย่าง] ข่าวสาร: วิธีเตรียมบ้านก่อนรับน้อง","status":"DRAFT"}', '', 3060),
  (950089, 'demo-03.admin.ton@pawhome.test', 'announcement.publish', 'announcement', '506', '{}', '', 2880),
  (950090, 'demo-02.admin.nok@pawhome.test', 'announcement.create', 'announcement', '507', '{"title":"[ตัวอย่าง] ผู้สนับสนุนอาหารประจำเดือน","status":"DRAFT"}', '', 59040),
  (950091, 'demo-02.admin.nok@pawhome.test', 'announcement.publish', 'announcement', '507', '{}', '', 57600),
  (950092, 'demo-03.admin.ton@pawhome.test', 'announcement.create', 'announcement', '508', '{"title":"[ตัวอย่าง] กิจกรรมตรวจสุขภาพน้องฟรี (หมดเขตแล้ว)","status":"DRAFT"}', '', 44640),
  (950093, 'demo-03.admin.ton@pawhome.test', 'announcement.publish', 'announcement', '508', '{}', '', 43200),
  (950094, 'demo-02.admin.nok@pawhome.test', 'announcement.create', 'announcement', '509', '{"title":"[ตัวอย่าง] เปิดรับบ้านอุปถัมภ์ชั่วคราว (ตั้งเวลา)","status":"DRAFT"}', '', 1440),
  (950095, 'demo-03.admin.ton@pawhome.test', 'announcement.create', 'announcement', '510', '{"title":"[ร่าง] สรุปยอดรับเลี้ยงประจำเดือน","status":"DRAFT"}', '', 720),
  (950096, 'demo-02.admin.nok@pawhome.test', 'announcement.create', 'announcement', '511', '{"title":"[ร่าง] เวิร์กช็อปฝึกน้องเบื้องต้น","status":"DRAFT"}', '', 2880),
  (950097, 'demo-03.admin.ton@pawhome.test', 'announcement.create', 'announcement', '512', '{"title":"[ร่าง] ขอบคุณอาสาสมัคร","status":"DRAFT"}', '', 4320),
  (950098, 'demo-01.superadmin@pawhome.test', 'user.suspend', 'user', 'demo-39.suspended.x@pawhome.test', '{}', 'บัญชีทดสอบสำหรับสถานะถูกระงับ (ข้อมูลตัวอย่าง)', 11520),
  (950099, 'demo-01.superadmin@pawhome.test', 'admin.set_role', 'user', 'demo-02.admin.nok@pawhome.test', '{"role":{"from":"USER","to":"ADMIN"}}', '', 86400),
  (950100, 'demo-01.superadmin@pawhome.test', 'admin.set_role', 'user', 'demo-03.admin.ton@pawhome.test', '{"role":{"from":"USER","to":"ADMIN"}}', '', 86400)
) as v(id, actor_email, action, target_type, target, changes, reason, m)
join auth.users u on u.email = v.actor_email
left join public.admin_memberships m on m.user_id = u.id
cross join a
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.admin_audit_logs', 'id'), (select max(id) from public.admin_audit_logs));
