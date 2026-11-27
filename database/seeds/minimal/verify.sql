-- =========================================================
-- PawHome — ตรวจชุดข้อมูลสาธิตขนาดเล็ก pawhome-demo-minimal-v1 · อ่านอย่างเดียว · ทุกแถวต้อง ok = true
-- รันคู่กับ database/verification/verify-adoption-workflow.sql (กฎขั้นตอนทั้งฐานข้อมูล)
-- =========================================================
with r as (select * from public.adoption_requests where id between 3501 and 3512),
p as (select * from public.pets where id between 2201 and 2210),
checks(check_name, expected, actual) as (
  -- จำนวนแถว
  select 'count: demo users', '6', (select count(*) from auth.users where email like 'mini-0_.%@pawhome.test')::text
  union all select 'count: pets', '10', (select count(*) from p)::text
  union all select 'count: adoption requests', '12', (select count(*) from r)::text
  union all select 'count: favorites', '8', (select count(*) from public.favorites where pet_id between 2201 and 2210)::text
  union all select 'count: timeline events', '36', (select count(*) from public.adoption_stage_history where id between 960001 and 960999)::text
  union all select 'count: handover reports', '6', (select count(*) from public.adoption_handover_reports where id between 961001 and 961999)::text
  union all select 'count: follow-up records', '4', (select count(*) from public.adoption_follow_ups where id between 962001 and 962999)::text
  union all select 'count: follow-up cases', '3', (select count(distinct request_id) from public.adoption_follow_ups where id between 962001 and 962999)::text
  union all select 'count: announcements', '3', (select count(*) from public.announcements where id between 601 and 603)::text
  union all select 'count: notifications', '16', (select count(*) from public.notification_events where id between 963001 and 963999)::text

  -- 10 สถานการณ์สาธิต
  union all select 'scenario 1: pet waiting with no requests', '1', (select count(*) from p where status = 'AVAILABLE' and not exists (select 1 from public.adoption_requests x where x.pet_id = p.id))::text
  union all select 'scenario 2: new request waiting for owner', 'true', exists (select 1 from r where stage = 'PENDING' and last_activity_at > now() - interval '24 hours')::text
  union all select 'scenario 3: accepted, pet not adopted yet', 'true', exists (select 1 from r join p on p.id = r.pet_id where r.stage = 'ACCEPTED' and p.status = 'PENDING')::text
  union all select 'scenario 4: arranging handover', '1', (select count(*) from r where stage = 'ARRANGING_HANDOVER')::text
  union all select 'scenario 5: reported, waiting for the other side to confirm', '1', (select count(*) from r where stage = 'HANDOVER_REPORTED' and not disputed and (owner_confirmed_at is null) <> (applicant_confirmed_at is null))::text
  union all select 'scenario 6: adoption completed, pet ADOPTED', '1', (select count(*) from r join p on p.id = r.pet_id where r.stage = 'COMPLETED' and p.status = 'ADOPTED')::text
  union all select 'scenario 7: owner silent > 48h (in follow-up queue)', '1', (select count(*) from r where stage = 'PENDING' and last_activity_at < now() - interval '48 hours' and follow_up_required)::text
  union all select 'scenario 8: conflicting reports → disputed', '1', (select count(*) from r where disputed and stage = 'HANDOVER_REPORTED')::text
  union all select 'scenario 9: rejected and cancelled requests', 'true', (exists (select 1 from r where stage = 'REJECTED') and exists (select 1 from r where stage = 'CANCELLED'))::text
  union all select 'scenario 10: admin follow-up recorded in notes', 'true', (
    exists (select 1 from public.adoption_follow_ups where id between 962001 and 962999 and kind = 'CONTACT'))::text

  -- สถานะน้องตรงกับคำขอ
  union all select 'pet status: matches requests', '0', (select count(*) from p where status <> case
      when exists (select 1 from r x where x.pet_id = p.id and (x.stage = 'COMPLETED' or x.legacy_review)) then 'ADOPTED'
      when exists (select 1 from r x where x.pet_id = p.id and x.stage in ('PENDING', 'ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED')) then 'PENDING'
      else 'AVAILABLE' end)::text

  -- FK / ข้อมูลสมมติ / RBAC
  union all select 'fk: requests point to existing pets and users', '0', (select count(*) from r left join p on p.id = r.pet_id left join public.profiles u on u.id = r.user_id where p.id is null or u.id is null)::text
  union all select 'fk: notifications point to existing requests', '0', (select count(*) from public.notification_events n left join public.adoption_requests x on x.id = n.request_id where n.id between 963001 and 963999 and x.id is null)::text
  union all select 'rule: no request on own pet', '0', (select count(*) from r join p on p.id = r.pet_id where r.user_id = p.owner_id)::text
  union all select 'rule: notifications go to owner/applicant/admin queue', '0', (select count(*) from public.notification_events n join r on r.id = n.request_id join p on p.id = r.pet_id where n.recipient_id is not null and n.recipient_id not in (r.user_id, p.owner_id))::text
  union all select 'fictional: phones start with 00000', '0', (select count(*) from r where phone not like '00000%')::text
  union all select 'rbac: exactly one SUPER_ADMIN (mini-01)', '1', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like 'mini-0_.%@pawhome.test' and m.role = 'SUPER_ADMIN')::text
  union all select 'rbac: other demo users are regular users', '0', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like 'mini-0_.%@pawhome.test' and u.email <> 'mini-01.admin@pawhome.test')::text
)
select check_name, expected, actual, expected = actual as ok
from checks
order by ok, check_name;
