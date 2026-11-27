-- =========================================================
-- PawHome demo dataset pawhome-demo-v1 (v1.0.0) — รายงานส่งมอบ
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: 006-demo-handover.sql
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
insert into public.adoption_handover_reports (id, request_id, party, handover_date, outcome, note, evidence_url, version, reporter_id, created_at)
select v.id, v.request_id, v.party, (a.t - make_interval(days => v.handover_days))::date, v.outcome, v.note, '', v.version, u.id, a.t - make_interval(mins => v.m)
from (values
  (920001, 3001, 'OWNER', 87, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-06.owner.malee@pawhome.test', 129202),
  (920002, 3001, 'OWNER', 87, 'HANDED_OVER', 'แก้ไขรายละเอียด: ส่งมอบพร้อมกรงและอาหาร 1 ถุง', 2, 'demo-06.owner.malee@pawhome.test', 128903),
  (920003, 3001, 'APPLICANT', 87, 'HANDED_OVER', '', 3, 'demo-25.adopter.pop@pawhome.test', 127600),
  (920004, 3002, 'OWNER', 20, 'HANDED_OVER', '', 1, 'demo-06.owner.malee@pawhome.test', 30477),
  (920005, 3002, 'APPLICANT', 20, 'HANDED_OVER', 'รับน้องแล้ว น้องปรับตัวได้ดี', 2, 'demo-25.adopter.pop@pawhome.test', 29644),
  (920006, 3004, 'OWNER', 78, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-06.owner.malee@pawhome.test', 112832),
  (920007, 3004, 'OWNER', 78, 'HANDED_OVER', 'แก้ไขรายละเอียด: ส่งมอบพร้อมกรงและอาหาร 1 ถุง', 2, 'demo-06.owner.malee@pawhome.test', 112498),
  (920008, 3004, 'APPLICANT', 78, 'HANDED_OVER', '', 3, 'demo-25.adopter.pop@pawhome.test', 111654),
  (920009, 3007, 'OWNER', 18, 'HANDED_OVER', '', 1, 'demo-06.owner.malee@pawhome.test', 26613),
  (920010, 3007, 'APPLICANT', 18, 'HANDED_OVER', 'รับน้องแล้ว น้องปรับตัวได้ดี', 2, 'demo-12.owner.kanya@pawhome.test', 25954),
  (920011, 3008, 'OWNER', 49, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-06.owner.malee@pawhome.test', 71942),
  (920012, 3008, 'OWNER', 49, 'HANDED_OVER', 'แก้ไขรายละเอียด: ส่งมอบพร้อมกรงและอาหาร 1 ถุง', 2, 'demo-06.owner.malee@pawhome.test', 71859),
  (920013, 3008, 'APPLICANT', 49, 'HANDED_OVER', 'รับน้องแล้ว น้องปรับตัวได้ดี', 3, 'demo-32.applicant.pang@pawhome.test', 71084),
  (920014, 3010, 'OWNER', 40, 'HANDED_OVER', '', 1, 'demo-06.owner.malee@pawhome.test', 55887),
  (920015, 3010, 'APPLICANT', 40, 'HANDED_OVER', '', 2, 'demo-11.owner.arthit@pawhome.test', 55020),
  (920016, 3013, 'OWNER', 30, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-04.shelter.sisa@pawhome.test', 44816),
  (920017, 3013, 'OWNER', 30, 'HANDED_OVER', 'แก้ไขรายละเอียด: ส่งมอบพร้อมกรงและอาหาร 1 ถุง', 2, 'demo-04.shelter.sisa@pawhome.test', 44623),
  (920018, 3013, 'APPLICANT', 30, 'HANDED_OVER', '', 3, 'demo-07.owner.somchai@pawhome.test', 44078),
  (920019, 3014, 'OWNER', 61, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-08.owner.pim@pawhome.test', 86234),
  (920020, 3014, 'APPLICANT', 61, 'HANDED_OVER', '', 2, 'demo-36.applicant.boss@pawhome.test', 84954),
  (920021, 3016, 'OWNER', 26, 'HANDED_OVER', '', 1, 'demo-09.owner.krit@pawhome.test', 37804),
  (920022, 3016, 'OWNER', 26, 'HANDED_OVER', 'แก้ไขรายละเอียด: ส่งมอบพร้อมกรงและอาหาร 1 ถุง', 2, 'demo-09.owner.krit@pawhome.test', 37581),
  (920023, 3016, 'APPLICANT', 26, 'HANDED_OVER', 'รับน้องแล้ว น้องปรับตัวได้ดี', 3, 'demo-22.applicant.ning@pawhome.test', 36429),
  (920024, 3019, 'OWNER', 41, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-04.shelter.sisa@pawhome.test', 60261),
  (920025, 3019, 'APPLICANT', 41, 'HANDED_OVER', '', 2, 'demo-22.applicant.ning@pawhome.test', 58974),
  (920026, 3020, 'OWNER', 46, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-10.owner.nida@pawhome.test', 70298),
  (920027, 3020, 'APPLICANT', 48, 'HANDED_OVER', '', 2, 'demo-16.owner.fah@pawhome.test', 69454),
  (920028, 3020, 'APPLICANT', 46, 'HANDED_OVER', 'แก้วันที่ให้ตรงกับวันส่งมอบจริง', 3, 'demo-16.owner.fah@pawhome.test', 67647),
  (920029, 3022, 'OWNER', 26, 'HANDED_OVER', 'ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน', 1, 'demo-11.owner.arthit@pawhome.test', 38246),
  (920030, 3022, 'APPLICANT', 28, 'HANDED_OVER', '', 2, 'demo-08.owner.pim@pawhome.test', 37318),
  (920031, 3022, 'APPLICANT', 26, 'HANDED_OVER', 'แก้วันที่ให้ตรงกับวันส่งมอบจริง', 3, 'demo-08.owner.pim@pawhome.test', 35009),
  (920032, 3033, 'OWNER', 33, 'HANDED_OVER', '', 1, 'demo-14.owner.ploy@pawhome.test', 47609),
  (920033, 3034, 'OWNER', 66, 'HANDED_OVER', '', 1, 'demo-15.owner.wut@pawhome.test', 96573),
  (920034, 3036, 'OWNER', 46, 'HANDED_OVER', '', 1, 'demo-04.shelter.sisa@pawhome.test', 67055),
  (920035, 3036, 'APPLICANT', 46, 'HANDED_OVER', '', 2, 'demo-33.applicant.jack@pawhome.test', 66361),
  (920036, 3037, 'OWNER', 53, 'HANDED_OVER', '', 1, 'demo-16.owner.fah@pawhome.test', 78066),
  (920037, 3037, 'APPLICANT', 53, 'HANDED_OVER', '', 2, 'demo-22.applicant.ning@pawhome.test', 77598),
  (920038, 3039, 'OWNER', 25, 'HANDED_OVER', '', 1, 'demo-17.owner.beam@pawhome.test', 38144),
  (920039, 3039, 'APPLICANT', 25, 'HANDED_OVER', '', 2, 'demo-22.applicant.ning@pawhome.test', 37767),
  (920040, 3039, 'OWNER', 25, 'HANDED_OVER', 'เพิ่มรายละเอียด: ส่งมอบพร้อมสมุดวัคซีน', 3, 'demo-17.owner.beam@pawhome.test', 37539),
  (920041, 3040, 'OWNER', 24, 'HANDED_OVER', '', 1, 'demo-04.shelter.sisa@pawhome.test', 36256),
  (920042, 3040, 'APPLICANT', 24, 'HANDED_OVER', '', 2, 'demo-18.owner.mint@pawhome.test', 34994),
  (920043, 3042, 'OWNER', 40, 'HANDED_OVER', '', 1, 'demo-18.owner.mint@pawhome.test', 57556),
  (920044, 3042, 'APPLICANT', 42, 'HANDED_OVER', 'จำวันที่ได้ว่าเป็นอีกวัน', 2, 'demo-29.applicant.big@pawhome.test', 56369),
  (920045, 3043, 'OWNER', 58, 'HANDED_OVER', '', 1, 'demo-19.owner.toey@pawhome.test', 84205),
  (920046, 3043, 'APPLICANT', 60, 'HANDED_OVER', 'จำวันที่ได้ว่าเป็นอีกวัน', 2, 'demo-15.owner.wut@pawhome.test', 83348)
) as v(id, request_id, party, handover_days, outcome, note, version, reporter_email, m)
join auth.users u on u.email = v.reporter_email
cross join a
on conflict (id) do nothing;
select setval(pg_get_serial_sequence('public.adoption_handover_reports', 'id'), (select max(id) from public.adoption_handover_reports));
