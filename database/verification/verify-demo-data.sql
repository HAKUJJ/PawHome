-- =========================================================
-- PawHome — ตรวจชุดข้อมูลทดสอบ pawhome-demo-v1 (สร้างโดย generate-demo-seed.ts) · อ่านอย่างเดียว · ทุกแถวต้อง ok = true
-- รันหลัง database/seeds/001…010 · ใช้ได้ทั้ง PGlite และ Supabase Development
-- =========================================================
with checks(check_name, expected, actual) as (
  select 'count: demo users', '40', (select count(*) from auth.users where email like 'demo-%@pawhome.test')::text
  union all
  select 'count: demo admins', '3', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like 'demo-%@pawhome.test')::text
  union all
  select 'count: demo suspended', '1', (select count(*) from public.user_suspensions s join auth.users u on u.id = s.user_id where u.email like 'demo-%@pawhome.test')::text
  union all
  select 'count: pets', '100', (select count(*) from public.pets where id between 2001 and 2100)::text
  union all
  select 'count: pets AVAILABLE', '25', (select count(*) from public.pets where id between 2001 and 2100 and status = 'AVAILABLE')::text
  union all
  select 'count: pets PENDING', '59', (select count(*) from public.pets where id between 2001 and 2100 and status = 'PENDING')::text
  union all
  select 'count: pets ADOPTED', '16', (select count(*) from public.pets where id between 2001 and 2100 and status = 'ADOPTED')::text
  union all
  select 'count: pets visibility VISIBLE', '95', (select count(*) from public.pets where id between 2001 and 2100 and visibility = 'VISIBLE')::text
  union all
  select 'count: pets visibility HIDDEN', '2', (select count(*) from public.pets where id between 2001 and 2100 and visibility = 'HIDDEN')::text
  union all
  select 'count: pets visibility CHANGES_REQUESTED', '2', (select count(*) from public.pets where id between 2001 and 2100 and visibility = 'CHANGES_REQUESTED')::text
  union all
  select 'count: pets visibility REVIEW', '1', (select count(*) from public.pets where id between 2001 and 2100 and visibility = 'REVIEW')::text
  union all
  select 'count: favorites', '150', (select count(*) from public.favorites where pet_id between 2001 and 2100)::text
  union all
  select 'count: adoption requests', '180', (select count(*) from public.adoption_requests where id between 3001 and 3999)::text
  union all
  select 'count: requests PENDING', '91', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'PENDING')::text
  union all
  select 'count: requests ACCEPTED', '14', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'ACCEPTED')::text
  union all
  select 'count: requests ARRANGING_HANDOVER', '8', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'ARRANGING_HANDOVER')::text
  union all
  select 'count: requests HANDOVER_REPORTED', '8', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'HANDOVER_REPORTED')::text
  union all
  select 'count: requests COMPLETED', '12', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'COMPLETED')::text
  union all
  select 'count: requests REJECTED', '41', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'REJECTED')::text
  union all
  select 'count: requests CANCELLED', '6', (select count(*) from public.adoption_requests where id between 3001 and 3999 and stage = 'CANCELLED')::text
  union all
  select 'count: legacy review', '4', (select count(*) from public.adoption_requests where id between 3001 and 3999 and legacy_review)::text
  union all
  select 'count: disputed', '2', (select count(*) from public.adoption_requests where id between 3001 and 3999 and disputed)::text
  union all
  select 'count: escalated', '6', (select count(*) from public.adoption_requests where id between 3001 and 3999 and escalated)::text
  union all
  select 'count: closed', '4', (select count(*) from public.adoption_requests where id between 3001 and 3999 and closed_at is not null)::text
  union all
  select 'count: timeline events', '393', (select count(*) from public.adoption_stage_history where id between 910001 and 919999)::text
  union all
  select 'count: handover reports', '46', (select count(*) from public.adoption_handover_reports where id between 920001 and 929999)::text
  union all
  select 'count: follow-ups', '70', (select count(*) from public.adoption_follow_ups where id between 930001 and 939999)::text
  union all
  select 'count: announcements', '12', (select count(*) from public.announcements where id between 501 and 520)::text
  union all
  select 'count: notifications', '569', (select count(*) from public.notification_events where id between 940001 and 949999)::text
  union all
  select 'count: unread notifications (personal)', '136', (select count(*) from public.notification_events where id between 940001 and 949999 and read_at is null and recipient_id is not null)::text
  union all
  select 'count: audit logs (dataset)', '100', (select count(*) from public.admin_audit_logs where changes ->> 'dataset' = 'pawhome-demo-v1')::text

  -- ไม่มีข้อมูลกำพร้า (FK ทุกตัวชี้ไปแถวที่มีอยู่)
  union all select 'orphan: pets without owner profile', '0', (select count(*) from public.pets p left join public.profiles o on o.id = p.owner_id where o.id is null)::text
  union all select 'orphan: requests without pet/applicant', '0', (select count(*) from public.adoption_requests r left join public.pets p on p.id = r.pet_id left join public.profiles u on u.id = r.user_id where p.id is null or u.id is null)::text
  union all select 'orphan: timeline without request', '0', (select count(*) from public.adoption_stage_history h left join public.adoption_requests r on r.id = h.request_id where r.id is null)::text
  union all select 'orphan: reports without request', '0', (select count(*) from public.adoption_handover_reports h left join public.adoption_requests r on r.id = h.request_id where r.id is null)::text
  union all select 'orphan: notifications without target', '0', (select count(*) from public.notification_events n left join public.adoption_requests r on r.id = n.request_id left join public.announcements a on a.id = n.announcement_id where r.id is null and a.id is null)::text

  -- ช่องที่ต้องมีค่า / ข้อมูลสมมติ
  union all select 'required: pets name/description/province', '0', (select count(*) from public.pets where id between 2001 and 2100 and (btrim(name) = '' or btrim(description) = '' or btrim(province) = ''))::text
  union all select 'fictional: demo phones start with 00000 (ไม่ใช่เบอร์จริง)', '0', (select count(*) from public.adoption_requests where id between 3001 and 3999 and phone not like '00000%')::text
  union all select 'fictional: demo owners use @pawhome.test', '0', (select count(*) from public.pets p join auth.users u on u.id = p.owner_id where p.id between 2001 and 2100 and u.email not like 'demo-%@pawhome.test')::text
  union all select 'rule: no favorite on own pet', '0', (select count(*) from public.favorites f join public.pets p on p.id = f.pet_id where f.user_id = p.owner_id)::text
  union all select 'rule: no request on own pet', '0', (select count(*) from public.adoption_requests r join public.pets p on p.id = r.pet_id where r.user_id = p.owner_id)::text
  union all select 'rule: hidden/changes/review pets have no requests', '0', (select count(*) from public.adoption_requests r join public.pets p on p.id = r.pet_id where p.visibility <> 'VISIBLE')::text

  -- แจ้งเตือนเป็นของคนที่เกี่ยวข้องเท่านั้น
  union all select 'ownership: request notifications go to owner/applicant/admin queue', '0', (
    select count(*) from public.notification_events n join public.adoption_requests r on r.id = n.request_id join public.pets p on p.id = r.pet_id
    where n.recipient_id is not null and n.recipient_id not in (r.user_id, p.owner_id))::text
  union all select 'ownership: admin queue notifications are cron kinds only', '0', (
    select count(*) from public.notification_events where recipient_id is null and kind not in ('ADMIN_FOLLOW_UP', 'ESCALATION'))::text

  -- สิทธิ์ผู้ดูแลในชุดทดสอบ
  union all select 'admin: only demo accounts hold demo roles', '0', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like '%@pawhome.test' and u.email not like 'demo-0%')::text
  union all select 'admin: exactly one SUPER_ADMIN in dataset', '1', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like 'demo-%@pawhome.test' and m.role = 'SUPER_ADMIN')::text
)
select check_name, expected, actual, expected = actual as ok
from checks
order by ok, check_name;
