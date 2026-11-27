-- =========================================================
-- PawHome — ชุดข้อมูลสาธิตขนาดเล็ก pawhome-demo-minimal-v1
-- 6 ผู้ใช้ · 10 น้อง · 12 คำขอ ครอบคลุม 10 สถานการณ์ (ดู README.md)
-- ข้อมูลสมมติทั้งหมด · Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- ก่อนรัน: migrations 001 → 002 → 003 + บัญชี mini-0N.*@pawhome.test 6 บัญชี
--   (Supabase: cd backend && npm run seed:demo-users -- --dataset minimal · ห้าม insert ลง auth.users ตรง)
-- รันซ้ำได้: id ในช่วงของชุดนี้ + on conflict do nothing · ทั้งไฟล์อยู่ใน transaction เดียว (now() ค่าเดียวกันทั้งไฟล์)
-- =========================================================
begin;

do $$
begin
  if (select count(*) from auth.users where email like 'mini-0_.%@pawhome.test') < 6 then
    raise exception 'ต้องมีบัญชี mini-01…06@pawhome.test ครบ 6 บัญชีก่อน — รัน: cd backend && npm run seed:demo-users -- --dataset minimal';
  end if;
  if exists (select 1 from public.pets p join auth.users u on u.id = p.owner_id where u.email not like '%@pawhome.test')
     or exists (select 1 from public.adoption_requests r join auth.users u on u.id = r.user_id where u.email not like '%@pawhome.test') then
    raise exception 'พบข้อมูลของผู้ใช้จริง — seed นี้ใช้กับฐานข้อมูล Development/Test ที่ไม่มีข้อมูลจริงเท่านั้น';
  end if;
end $$;

-- ผู้ใช้ทั้ง 6 คน (อ้างด้วยอีเมล ไม่ hardcode UUID ของ auth)
create temp table mini_u on commit drop as
select split_part(email, '.', 1) as k, id from auth.users where email like 'mini-0_.%@pawhome.test';

-- ---------- ผู้ใช้ / ผู้ดูแล ----------
insert into public.profiles (id, name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1))
from auth.users u where u.email like 'mini-0_.%@pawhome.test'
on conflict (id) do nothing;

insert into public.admin_memberships (user_id, role)
select id, 'SUPER_ADMIN' from mini_u where k = 'mini-01'
on conflict (user_id) do nothing;

-- ---------- น้อง 10 ตัว ----------
insert into public.pets (id, owner_id, name, species, breed, age_months, sex, province, image_url, description,
  vaccinated, sterilized, urgent, status, created_at, updated_at)
select v.id, (select id from mini_u where k = v.owner), v.name, v.species, v.breed, v.age, v.sex, v.province, v.image, v.description,
  v.vaccinated, v.sterilized, v.urgent, v.status, now() - v.ago, now() - v.ago
from (values
  (2201, 'mini-02', 'ส้มโอ', 'CAT', 'ไทย', 10, 'FEMALE', 'กรุงเทพมหานคร', 'https://cdn2.thecatapi.com/images/edr.jpg',
   'แมวส้มขี้อ้อน ชอบนอนตักและเล่นไม้ตกแมว ใช้กระบะทรายเป็นแล้ว (ข้อมูลเดโม่)', true, true, false, 'AVAILABLE', interval '30 days'),
  (2202, 'mini-02', 'ข้าวตัง', 'DOG', 'พันทาง', 14, 'MALE', 'นนทบุรี', 'https://images.dog.ceo/breeds/mix/rilo.jpg',
   'หมาพันทางร่าเริง ชอบวิ่งเล่นในสนาม รู้คำสั่งนั่งและรอ (ข้อมูลเดโม่)', true, false, true, 'PENDING', interval '3 days'),
  (2203, 'mini-03', 'โมจิ', 'CAT', 'ขาวมณี', 6, 'FEMALE', 'เชียงใหม่', 'https://cdn2.thecatapi.com/images/267.jpg',
   'ลูกแมวขาวมณีตาสองสี ขี้เล่น เข้ากับแมวตัวอื่นได้ดี (ข้อมูลเดโม่)', true, false, false, 'PENDING', interval '5 days'),
  (2204, 'mini-02', 'บราวนี่', 'DOG', 'พันทาง', 60, 'FEMALE', 'ปทุมธานี', 'https://images.dog.ceo/breeds/mix/cheyenne2.jpg',
   'หมาโตใจดี นิ่ง ๆ ชอบนอนกลางแดด เหมาะกับบ้านที่มีผู้สูงอายุ (ข้อมูลเดโม่)', true, true, false, 'PENDING', interval '7 days'),
  (2205, 'mini-03', 'ปุยฝ้าย', 'CAT', 'เปอร์เซียผสม', 24, 'MALE', 'ขอนแก่น', 'https://cdn2.thecatapi.com/images/O-57OLhn7.jpg',
   'แมวขนฟูเงียบ ๆ ชอบซุกตัวในผ้าห่ม ต้องแปรงขนสัปดาห์ละครั้ง (ข้อมูลเดโม่)', true, true, false, 'PENDING', interval '10 days'),
  (2206, 'mini-02', 'ลัคกี้', 'DOG', 'ชิบะผสม', 18, 'MALE', 'ชลบุรี', 'https://images.dog.ceo/breeds/shiba/shiba-13.jpg',
   'หมาชิบะผสมฉลาด เดินสายจูงเก่ง ชอบทะเล (ข้อมูลเดโม่)', true, true, false, 'ADOPTED', interval '25 days'),
  (2207, 'mini-03', 'เจ้าด่าง', 'DOG', 'ไทยหลังอาน', 36, 'MALE', 'นครราชสีมา', 'https://images.dog.ceo/breeds/mix/floki-the-chilean-mutt-6.jpg',
   'หมาไทยลายด่าง ขี้ระวังคนแปลกหน้าช่วงแรก แต่ผูกพันกับเจ้าของมาก (ข้อมูลเดโม่)', true, false, true, 'PENDING', interval '4 days'),
  (2208, 'mini-02', 'น้ำตาล', 'CAT', 'ไทย', 30, 'FEMALE', 'สมุทรปราการ', 'https://cdn2.thecatapi.com/images/3rK7HGo7r.jpg',
   'แมวไทยสีน้ำตาล ช่างคุย ชอบนั่งริมหน้าต่างดูนก (ข้อมูลเดโม่)', true, true, false, 'PENDING', interval '12 days'),
  (2209, 'mini-03', 'ถุงทอง', 'DOG', 'พันทาง', 4, 'FEMALE', 'ภูเก็ต', '',
   'ลูกหมาเพิ่งหย่านม กินเก่ง ยังไม่มีรูปถ่าย (ทดสอบกรณีไม่มีรูป) (ข้อมูลเดโม่)', false, false, false, 'AVAILABLE', interval '8 days'),
  (2210, 'mini-02', 'มะลิ', 'CAT', 'วิเชียรมาศ', 48, 'FEMALE', 'สระบุรี', 'https://cdn2.thecatapi.com/images/MTY3NjI5MQ.jpg',
   'แมววิเชียรมาศสูงวัยนิสัยสุภาพ ชอบบ้านที่เงียบสงบ (ข้อมูลเดโม่)', true, true, false, 'AVAILABLE', interval '9 days')
) as v(id, owner, name, species, breed, age, sex, province, image, description, vaccinated, sterilized, urgent, status, ago)
on conflict (id) do nothing;

-- ---------- รายการโปรด 8 (ไม่มีการโปรดน้องของตัวเอง) ----------
insert into public.favorites (user_id, pet_id, created_at)
select (select id from mini_u where k = v.u), v.pet, now() - v.ago
from (values ('mini-04', 2201, interval '2 days'), ('mini-04', 2203, interval '4 days'), ('mini-05', 2201, interval '1 day'),
             ('mini-05', 2202, interval '2 days'), ('mini-05', 2204, interval '5 days'), ('mini-06', 2201, interval '6 hours'),
             ('mini-06', 2202, interval '1 day'), ('mini-03', 2204, interval '3 days')) as v(u, pet, ago)
on conflict (user_id, pet_id) do nothing;

-- ---------- คำขอรับเลี้ยง 12 (เบอร์ขึ้นต้น 00000 = ข้อความทดสอบ ไม่ใช่เบอร์จริง) ----------
insert into public.adoption_requests (id, pet_id, user_id, phone, housing, message, status, stage, created_at, updated_at, last_activity_at,
  follow_up_required, escalated, disputed, handover_version, owner_confirmed_at, applicant_confirmed_at, completed_at, closed_at)
select v.id, v.pet, (select id from mini_u where k = v.u), v.phone, v.housing, v.message, v.status, v.stage,
  now() - v.created, now() - v.activity, now() - v.activity, v.follow_up, false, v.disputed, v.version,
  now() - v.owner_conf, now() - v.app_conf, now() - v.completed, now() - v.closed
from (values
  -- 2) คำขอใหม่ รอเจ้าของตอบ
  (3501, 2202, 'mini-04', '0000010001', 'HOUSE', 'บ้านมีสนามหญ้า ทำงานที่บ้าน พาเดินเล่นเช้าเย็นได้ทุกวัน', 'PENDING', 'PENDING', interval '6 hours', interval '6 hours', false, false, 0, null::interval, null::interval, null::interval, null::interval),
  -- 3) เจ้าของตอบรับ แต่ยังไม่นัดส่งมอบ (+ คำขออื่นที่ยังรอ)
  (3502, 2203, 'mini-05', '0000010002', 'CONDO', 'คอนโดอนุญาตให้เลี้ยงแมว ติดมุ้งลวดระเบียงแล้ว', 'APPROVED', 'ACCEPTED', interval '72 hours', interval '68 hours', false, false, 0, null, null, null, null),
  (3503, 2203, 'mini-06', '0000010003', 'DORM', 'หอพักอนุญาตเลี้ยงแมวหนึ่งตัว มีเพื่อนร่วมห้องช่วยดูแล', 'PENDING', 'PENDING', interval '30 hours', interval '30 hours', false, false, 0, null, null, null, null),
  -- 4) กำลังนัดส่งมอบ (+ คำขออื่นที่ยังรอ)
  (3504, 2204, 'mini-04', '0000010004', 'HOUSE', 'อยู่กับคุณแม่ที่เกษียณแล้ว มีเวลาดูแลน้องทั้งวัน', 'APPROVED', 'ARRANGING_HANDOVER', interval '120 hours', interval '72 hours', false, false, 0, null, null, null, null),
  (3505, 2204, 'mini-05', '0000010005', 'HOUSE', 'บ้านเดี่ยวมีรั้วรอบ เคยเลี้ยงหมาโตมาก่อน', 'PENDING', 'PENDING', interval '20 hours', interval '20 hours', false, false, 0, null, null, null, null),
  -- 5) แจ้งส่งมอบแล้ว รายงานตรงกัน เจ้าของยืนยันแล้ว รอผู้ขอยืนยัน
  (3506, 2205, 'mini-06', '0000010006', 'CONDO', 'ชอบแมวขนยาว มีอุปกรณ์แปรงขนพร้อมแล้ว', 'APPROVED', 'HANDOVER_REPORTED', interval '192 hours', interval '20 hours', false, false, 2, interval '18 hours', null, null, null),
  -- 6) รับเลี้ยงสำเร็จ (คำขออื่นถูกปฏิเสธอัตโนมัติ)
  (3507, 2206, 'mini-05', '0000010007', 'HOUSE', 'บ้านใกล้ทะเล พาน้องเดินเล่นชายหาดได้ทุกเย็น', 'APPROVED', 'COMPLETED', interval '480 hours', interval '354 hours', false, false, 2, interval '354 hours', interval '356 hours', interval '354 hours', null),
  (3508, 2206, 'mini-06', '0000010008', 'DORM', 'อยากมีเพื่อนเดินเล่น หอพักอนุญาตสัตว์เล็ก', 'REJECTED', 'REJECTED', interval '478 hours', interval '354 hours', false, false, 0, null, null, null, null),
  -- 7) เจ้าของไม่ตอบเกิน 48 ชม. → ผู้ดูแลติดตาม (ธงต้องติดตาม)
  (3509, 2207, 'mini-05', '0000010009', 'HOUSE', 'เคยเลี้ยงหมาไทยมาก่อน เข้าใจนิสัยขี้ระวังคนแปลกหน้า', 'PENDING', 'PENDING', interval '52 hours', interval '52 hours', true, false, 0, null, null, null, null),
  -- 8) รายงานส่งมอบสองฝ่ายไม่ตรงกัน → ข้อพิพาท รอผู้ดูแลตรวจ
  (3510, 2208, 'mini-04', '0000010010', 'CONDO', 'ทำงานที่บ้าน ห้องมีที่นั่งริมหน้าต่างให้น้องดูนก', 'APPROVED', 'HANDOVER_REPORTED', interval '240 hours', interval '48 hours', true, true, 2, null, null, null, null),
  -- 9) ถูกปฏิเสธ / ยกเลิกหลังตอบรับ (ปิดเคสแล้ว)
  (3511, 2209, 'mini-06', '0000010011', 'DORM', 'อยากรับลูกหมาไปเลี้ยงที่หอ', 'REJECTED', 'REJECTED', interval '144 hours', interval '120 hours', false, false, 0, null, null, null, null),
  (3512, 2210, 'mini-04', '0000010012', 'HOUSE', 'บ้านเงียบสงบ เหมาะกับแมวสูงวัย', 'CANCELLED', 'CANCELLED', interval '168 hours', interval '96 hours', false, false, 0, null, null, null, interval '72 hours')
) as v(id, pet, u, phone, housing, message, status, stage, created, activity, follow_up, disputed, version, owner_conf, app_conf, completed, closed)
on conflict (id) do nothing;

-- ---------- ไทม์ไลน์ (ตรงกับ stage ปัจจุบัน เวลาเรียงจากเก่าไปใหม่) ----------
insert into public.adoption_stage_history (id, request_id, from_stage, to_stage, actor_id, actor_role, note, created_at)
select v.id, v.req, v.from_stage, v.to_stage, (select id from mini_u where k = v.actor), v.role, v.note, now() - v.ago
from (values
  (960001, 3501, null, 'PENDING', 'mini-04', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '6 hours'),
  (960002, 3502, null, 'PENDING', 'mini-05', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '72 hours'),
  (960003, 3502, 'PENDING', 'ACCEPTED', 'mini-03', 'OWNER', 'เจ้าของตอบรับคำขอ', interval '68 hours'),
  (960004, 3503, null, 'PENDING', 'mini-06', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '30 hours'),
  (960005, 3504, null, 'PENDING', 'mini-04', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '120 hours'),
  (960006, 3504, 'PENDING', 'ACCEPTED', 'mini-02', 'OWNER', 'เจ้าของตอบรับคำขอ', interval '114 hours'),
  (960007, 3504, 'ACCEPTED', 'ARRANGING_HANDOVER', 'mini-02', 'OWNER', 'เริ่มนัดส่งมอบ', interval '72 hours'),
  (960008, 3505, null, 'PENDING', 'mini-05', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '20 hours'),
  (960009, 3506, null, 'PENDING', 'mini-06', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '192 hours'),
  (960010, 3506, 'PENDING', 'ACCEPTED', 'mini-03', 'OWNER', 'เจ้าของตอบรับคำขอ', interval '188 hours'),
  (960011, 3506, 'ACCEPTED', 'ARRANGING_HANDOVER', 'mini-03', 'OWNER', 'เริ่มนัดส่งมอบ', interval '144 hours'),
  (960012, 3506, 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'mini-03', 'OWNER', 'บันทึกรายงานส่งมอบ', interval '24 hours'),
  (960013, 3506, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', 'mini-06', 'APPLICANT', 'บันทึกรายงานส่งมอบ', interval '20 hours'),
  (960014, 3506, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', 'mini-03', 'OWNER', 'ยืนยันรายละเอียดส่งมอบ', interval '18 hours'),
  (960015, 3507, null, 'PENDING', 'mini-05', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '480 hours'),
  (960016, 3508, null, 'PENDING', 'mini-06', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '478 hours'),
  (960017, 3507, 'PENDING', 'ACCEPTED', 'mini-02', 'OWNER', 'เจ้าของตอบรับคำขอ', interval '456 hours'),
  (960018, 3507, 'ACCEPTED', 'ARRANGING_HANDOVER', 'mini-02', 'OWNER', 'เริ่มนัดส่งมอบ', interval '408 hours'),
  (960019, 3507, 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'mini-02', 'OWNER', 'บันทึกรายงานส่งมอบ', interval '360 hours'),
  (960020, 3507, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', 'mini-05', 'APPLICANT', 'บันทึกรายงานส่งมอบ', interval '358 hours'),
  (960021, 3507, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', 'mini-05', 'APPLICANT', 'ยืนยันรายละเอียดส่งมอบ', interval '356 hours'),
  (960022, 3507, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', 'mini-02', 'OWNER', 'ยืนยันรายละเอียดส่งมอบ', interval '354 hours'),
  (960023, 3507, 'HANDOVER_REPORTED', 'COMPLETED', null, 'SYSTEM', 'ยืนยันส่งมอบครบสองฝ่าย · รับเลี้ยงสำเร็จ', interval '354 hours'),
  (960024, 3508, 'PENDING', 'REJECTED', null, 'SYSTEM', 'น้องได้บ้านแล้ว', interval '354 hours'),
  (960025, 3509, null, 'PENDING', 'mini-05', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '52 hours'),
  (960026, 3510, null, 'PENDING', 'mini-04', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '240 hours'),
  (960027, 3510, 'PENDING', 'ACCEPTED', 'mini-02', 'OWNER', 'เจ้าของตอบรับคำขอ', interval '216 hours'),
  (960028, 3510, 'ACCEPTED', 'ARRANGING_HANDOVER', 'mini-02', 'OWNER', 'เริ่มนัดส่งมอบ', interval '192 hours'),
  (960029, 3510, 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'mini-02', 'OWNER', 'บันทึกรายงานส่งมอบ', interval '72 hours'),
  (960030, 3510, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', 'mini-04', 'APPLICANT', 'บันทึกรายงานส่งมอบ', interval '48 hours'),
  (960031, 3510, 'HANDOVER_REPORTED', 'HANDOVER_REPORTED', null, 'SYSTEM', 'รายงานสองฝ่ายไม่ตรงกัน · ต้องให้ผู้ดูแลตรวจสอบ', interval '48 hours'),
  (960032, 3511, null, 'PENDING', 'mini-06', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '144 hours'),
  (960033, 3511, 'PENDING', 'REJECTED', 'mini-03', 'OWNER', 'เจ้าของปฏิเสธคำขอ', interval '120 hours'),
  (960034, 3512, null, 'PENDING', 'mini-04', 'APPLICANT', 'ส่งคำขอรับเลี้ยง', interval '168 hours'),
  (960035, 3512, 'PENDING', 'ACCEPTED', 'mini-02', 'OWNER', 'เจ้าของตอบรับคำขอ', interval '144 hours'),
  (960036, 3512, 'ACCEPTED', 'CANCELLED', 'mini-04', 'APPLICANT', 'ผู้ขอยกเลิกคำขอ', interval '96 hours')
) as v(id, req, from_stage, to_stage, actor, role, note, ago)
on conflict (id) do nothing;

-- ---------- รายงานส่งมอบ (version = ลำดับรายงานของคำขอ) ----------
insert into public.adoption_handover_reports (id, request_id, party, handover_date, outcome, note, evidence_url, version, reporter_id, created_at)
select v.id, v.req, v.party, (now() - v.handover)::date, 'HANDED_OVER', v.note, '', v.version, (select id from mini_u where k = v.reporter), now() - v.ago
from (values
  (961001, 3506, 'OWNER', interval '1 day', 'ส่งมอบที่บ้านผู้รับ พร้อมแปรงขนและอาหาร 1 ถุง', 1, 'mini-03', interval '24 hours'),
  (961002, 3506, 'APPLICANT', interval '1 day', 'รับน้องแล้ว น้องเริ่มเดินสำรวจห้อง', 2, 'mini-06', interval '20 hours'),
  (961003, 3507, 'OWNER', interval '15 days', 'ส่งมอบพร้อมสมุดวัคซีน', 1, 'mini-02', interval '360 hours'),
  (961004, 3507, 'APPLICANT', interval '15 days', '', 2, 'mini-05', interval '358 hours'),
  (961005, 3510, 'OWNER', interval '3 days', 'นัดส่งมอบที่หน้าคอนโด', 1, 'mini-02', interval '72 hours'),
  (961006, 3510, 'APPLICANT', interval '2 days', 'จำได้ว่าได้รับน้องอีกวันหนึ่ง', 2, 'mini-04', interval '48 hours')
) as v(id, req, party, handover, note, version, reporter, ago)
on conflict (id) do nothing;

-- ---------- บันทึกผู้ดูแล (3 เคส) — ไม่เปลี่ยน last_activity_at ----------
insert into public.adoption_follow_ups (id, request_id, kind, note, actor_id, created_at)
select v.id, v.req, v.kind, v.note, (select id from mini_u where k = 'mini-01'), now() - v.ago
from (values
  (962001, 3509, 'CONTACT', 'โทรหาเจ้าของแล้ว ไม่รับสาย จะโทรอีกครั้งพรุ่งนี้', interval '3 hours'),
  (962002, 3509, 'FLAG', '', interval '2 hours'),
  (962003, 3510, 'NOTE', 'รอหลักฐาน: ขอรูปวันส่งมอบจากทั้งสองฝ่าย', interval '24 hours'),
  (962004, 3512, 'CLOSE', 'ผู้ขอยกเลิกแล้ว ปิดเคส', interval '72 hours')
) as v(id, req, kind, note, ago)
on conflict (id) do nothing;

-- ---------- ประกาศ 3 รายการเดิมของหน้าแรก (ลิงก์เดิม ไม่เปลี่ยน URL) ----------
insert into public.announcements (id, title, category, description, event_time, cta, destination, status, display_order, is_demo,
  published_at, created_by, updated_by, created_at, updated_at)
select v.id, v.title, v.category, v.description, v.event_time, v.cta, v.destination, 'PUBLISHED', v.ord, false,
  now() - v.ago, a.id, a.id, now() - v.ago, now() - v.ago
from (values
  (601, 'ฉีดวัคซีนพิษสุนัขบ้าฟรี', 'ประชาสัมพันธ์', 'พาน้องหมาแมวอายุ 3 เดือนขึ้นไปมาฉีดวัคซีนพิษสุนัขบ้าฟรี ลงทะเบียนหน้างานตามลำดับคิว ไม่ต้องจองล่วงหน้า', '', 'ดูรายละเอียด', '/announcements/rabies-vaccine', 1, interval '20 days'),
  (602, 'บริจาคอาหารให้น้องในมูลนิธิ', 'ร่วมช่วยเหลือ', 'อาหารสุนัข อาหารแมว ทรายแมว ผ้าห่ม และอุปกรณ์ดูแลสัตว์ ช่วยน้องที่ยังรอบ้านได้ทุกตัว แจ้งความประสงค์แล้วนัดวันส่งของ', 'ทุกวัน 09:00–17:00 น.', 'วิธีบริจาค', '/support/donate-food', 2, interval '18 days'),
  (603, 'ทำหมันราคาพิเศษสำหรับน้องจร', 'ผู้สนับสนุน', 'ลดจำนวนสัตว์จรเกิดใหม่ กับคลินิกพันธมิตรที่ให้ราคาพิเศษแก่ผู้ดูแลน้องจรและผู้รับเลี้ยงจาก PawHome', 'จันทร์–เสาร์ 09:00–17:00 น.', 'จองคิว', '/partners/spay-neuter', 3, interval '16 days')
) as v(id, title, category, description, event_time, cta, destination, ord, ago)
cross join (select id from mini_u where k = 'mini-01') a
on conflict (id) do nothing;

-- ---------- แจ้งเตือน (activity_at อ้างเวลาจากแถวต้นทาง · read_at = อ่านแล้ว) ----------
insert into public.notification_events (id, request_id, recipient_id, kind, activity_at, channel, read_at, created_at)
select v.id, v.req, (select id from mini_u where k = v.recipient), v.kind, t.at, 'IN_APP',
  case when v.is_read then t.at + interval '30 minutes' end, t.at
from (values
  (963001, 3501, 'mini-02', 'NEW_REQUEST', 960001, false),
  (963002, 3502, 'mini-05', 'REQUEST_ACCEPTED', 960003, true),
  (963003, 3506, 'mini-06', 'HANDOVER_REPORTED', 960012, true),
  (963004, 3506, 'mini-03', 'HANDOVER_REPORTED', 960013, true),
  (963005, 3506, 'mini-06', 'HANDOVER_CONFIRMED', 960014, false),
  (963006, 3507, 'mini-05', 'ADOPTION_COMPLETED', 960023, true),
  (963007, 3507, 'mini-02', 'ADOPTION_COMPLETED', 960023, true),
  (963008, 3508, 'mini-06', 'REQUEST_REJECTED', 960024, true),
  (963009, 3509, 'mini-03', 'NEW_REQUEST', 960025, true),
  (963010, 3510, 'mini-04', 'HANDOVER_DISPUTED', 960031, false),
  (963011, 3510, 'mini-02', 'HANDOVER_DISPUTED', 960031, false),
  (963012, 3511, 'mini-06', 'REQUEST_REJECTED', 960033, true),
  (963013, 3512, 'mini-02', 'REQUEST_CANCELLED', 960036, true)
) as v(id, req, recipient, kind, history_id, is_read)
join lateral (select created_at as at from public.adoption_stage_history where id = v.history_id) t on true
on conflict do nothing;

-- แจ้งเตือนตามนโยบายเวลา (cron) ของคำขอ 3509 ที่เจ้าของเงียบ 52 ชม. · recipient null = คิวผู้ดูแล
insert into public.notification_events (id, request_id, recipient_id, kind, activity_at, channel, read_at, created_at)
select v.id, 3509, case when v.to_owner then (select id from mini_u where k = 'mini-03') end, v.kind, r.last_activity_at, 'IN_APP',
  case when v.is_read then now() - interval '20 hours' end, now() - v.ago
from (values
  (963014, 'OWNER_REMINDER', true, true, interval '28 hours'),
  (963015, 'OWNER_SECOND_REMINDER', true, false, interval '4 hours'),
  (963016, 'ADMIN_FOLLOW_UP', false, false, interval '4 hours')
) as v(id, kind, to_owner, is_read, ago)
cross join (select last_activity_at from public.adoption_requests where id = 3509) r
on conflict do nothing;


-- sequence ไม่ต่ำกว่าค่าที่ใช้แล้ว (แถวใหม่จากหน้าเว็บจะไม่ชน id ของชุดนี้)
select setval(pg_get_serial_sequence('public.pets', 'id'), (select max(id) from public.pets));
select setval(pg_get_serial_sequence('public.adoption_requests', 'id'), (select max(id) from public.adoption_requests));
select setval(pg_get_serial_sequence('public.announcements', 'id'), (select max(id) from public.announcements));
select setval(pg_get_serial_sequence('public.adoption_stage_history', 'id'), (select max(id) from public.adoption_stage_history));
select setval(pg_get_serial_sequence('public.adoption_handover_reports', 'id'), (select max(id) from public.adoption_handover_reports));
select setval(pg_get_serial_sequence('public.adoption_follow_ups', 'id'), (select max(id) from public.adoption_follow_ups));
select setval(pg_get_serial_sequence('public.notification_events', 'id'), (select max(id) from public.notification_events));

commit;
