-- =========================================================
-- PawHome — ตรวจกฎขั้นตอนรับเลี้ยงทั้งฐานข้อมูล (หลัง migrations 001–003 และ/หรือ seed) · อ่านอย่างเดียว
-- ทุกแถวต้อง ok = true · ใช้ได้ทั้ง PGlite และ Supabase Development
-- =========================================================
with latest_report as (
  select distinct on (request_id, party) request_id, party, handover_date, outcome
  from public.adoption_handover_reports order by request_id, party, id desc
),
timeline as (
  select h.request_id,
         (array_agg(h.from_stage order by h.id))[1] as first_from,
         (array_agg(h.to_stage order by h.id))[1] as first_to,
         (array_agg(h.actor_role order by h.id))[1] as first_role,
         (array_agg(h.to_stage order by h.id desc))[1] as last_to,
         (array_agg(h.created_at order by h.id))[1] as first_at,
         bool_and(h.created_at >= coalesce(prev_at, h.created_at)) as monotonic
  from (select h.*, lag(created_at) over (partition by request_id order by id) as prev_at from public.adoption_stage_history h) h
  group by h.request_id
),
checks(check_name, expected, actual) as (
  -- stage / status / สถานะน้อง
  select 'stage: status matches stage', '0', (select count(*) from public.adoption_requests where not (
    (stage = 'PENDING' and status = 'PENDING')
    or (stage in ('ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'COMPLETED') and status = 'APPROVED')
    or (stage = status)))::text
  union all select 'stage: one placed request per pet', '0', (select count(*) from (select pet_id from public.adoption_requests
    where stage in ('ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'COMPLETED') group by pet_id having count(*) > 1) d)::text
  union all select 'pet: ADOPTED iff completed or legacy request (requests in workflow)', '0', (
    select count(*) from public.pets p
    where exists (select 1 from public.adoption_requests r where r.pet_id = p.id)
      and (p.status = 'ADOPTED') <> exists (select 1 from public.adoption_requests r where r.pet_id = p.id and (r.stage = 'COMPLETED' or r.legacy_review)))::text
  union all select 'pet: PENDING iff open request and not adopted', '0', (
    select count(*) from public.pets p
    where exists (select 1 from public.adoption_requests r where r.pet_id = p.id)
      and (p.status = 'PENDING') <> (
        exists (select 1 from public.adoption_requests r where r.pet_id = p.id and r.stage in ('PENDING', 'ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED'))
        and not exists (select 1 from public.adoption_requests r where r.pet_id = p.id and (r.stage = 'COMPLETED' or r.legacy_review))))::text
  union all select 'pet: AVAILABLE pets have no open request', '0', (select count(*) from public.pets p join public.adoption_requests r on r.pet_id = p.id
    where p.status = 'AVAILABLE' and r.stage in ('PENDING', 'ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED'))::text

  -- การส่งมอบ
  union all select 'handover: COMPLETED needs both confirmed on matching reports, or admin verification', '0', (
    select count(*) from public.adoption_requests r
    left join latest_report o on o.request_id = r.id and o.party = 'OWNER'
    left join latest_report a on a.request_id = r.id and a.party = 'APPLICANT'
    where r.stage = 'COMPLETED' and not r.legacy_review and r.verified_by is null and not (
      r.owner_confirmed_at is not null and r.applicant_confirmed_at is not null
      and o.outcome = 'HANDED_OVER' and a.outcome = 'HANDED_OVER' and o.handover_date = a.handover_date))::text
  union all select 'handover: HANDOVER_REPORTED has at least one report', '0', (select count(*) from public.adoption_requests r
    where r.stage = 'HANDOVER_REPORTED' and not exists (select 1 from public.adoption_handover_reports h where h.request_id = r.id))::text
  union all select 'handover: no reports before arranging', '0', (select count(*) from public.adoption_requests r
    where r.stage in ('PENDING', 'ACCEPTED') and exists (select 1 from public.adoption_handover_reports h where h.request_id = r.id))::text
  union all select 'handover: version = number of reports', '0', (select count(*) from public.adoption_requests r
    where r.handover_version <> (select count(*) from public.adoption_handover_reports h where h.request_id = r.id))::text
  union all select 'handover: confirmations only on reported/completed', '0', (select count(*) from public.adoption_requests
    where (owner_confirmed_at is not null or applicant_confirmed_at is not null) and stage not in ('HANDOVER_REPORTED', 'COMPLETED'))::text
  union all select 'handover: disputed only while reported', '0', (select count(*) from public.adoption_requests where disputed and stage <> 'HANDOVER_REPORTED')::text
  union all select 'handover: open dispute is in follow-up queue', '0', (select count(*) from public.adoption_requests where disputed and not follow_up_required)::text

  -- ข้อมูลระบบเดิม
  union all select 'legacy: only ACCEPTED (never auto COMPLETED)', '0', (select count(*) from public.adoption_requests where legacy_review and stage <> 'ACCEPTED')::text
  union all select 'legacy: always in follow-up queue', '0', (select count(*) from public.adoption_requests where legacy_review and not follow_up_required and closed_at is null)::text

  -- ติดตามเคส
  union all select 'follow-up: escalated implies follow-up required (open cases)', '0', (select count(*) from public.adoption_requests where escalated and not follow_up_required and closed_at is null)::text
  union all select 'follow-up: closed only when finished', '0', (select count(*) from public.adoption_requests where closed_at is not null and stage not in ('COMPLETED', 'REJECTED', 'CANCELLED'))::text
  union all select 'follow-up: closed cases have no open flags', '0', (select count(*) from public.adoption_requests where closed_at is not null and (follow_up_required or escalated))::text
  -- เฉพาะคำขอที่สร้างผ่านขั้นตอนใหม่ (มีไทม์ไลน์) · คำขอเก่าก่อน migration / mock-data.sql ไม่มีไทม์ไลน์
  union all select 'follow-up: admin notes never change last_activity_at (pending)', '0', (select count(*) from public.adoption_requests r
    where r.stage = 'PENDING' and r.last_activity_at <> r.created_at
      and exists (select 1 from public.adoption_stage_history h where h.request_id = r.id))::text
  union all select 'follow-up: cron notifications only for PENDING requests at their activity time', '0', (select count(*) from public.notification_events n join public.adoption_requests r on r.id = n.request_id
    where n.kind in ('OWNER_REMINDER', 'OWNER_SECOND_REMINDER', 'ADMIN_FOLLOW_UP', 'ESCALATION') and (r.stage <> 'PENDING' or n.activity_at <> r.last_activity_at))::text
  union all select 'follow-up: no duplicate notifications', '0', (select count(*) from (select 1 from public.notification_events
    where request_id is not null group by request_id, kind, activity_at, recipient_id having count(*) > 1) d)::text

  -- ไทม์ไลน์
  -- คำขอ PENDING ที่สร้างก่อน migration ไม่มีไทม์ไลน์ (001 เติมให้เฉพาะแถวที่ผ่านขั้นแรกแล้ว)
  union all select 'timeline: every request past PENDING has history', '0', (select count(*) from public.adoption_requests r left join timeline t on t.request_id = r.id where t.request_id is null and r.stage <> 'PENDING')::text
  union all select 'timeline: starts with request created (null → PENDING) or a SYSTEM migration entry', '0', (select count(*) from timeline t
    where not (t.first_from is null and t.first_to = 'PENDING') and t.first_role <> 'SYSTEM')::text
  union all select 'timeline: ends at current stage', '0', (select count(*) from timeline t join public.adoption_requests r on r.id = t.request_id where t.last_to <> r.stage)::text
  union all select 'timeline: times never go backwards', '0', (select count(*) from timeline where not monotonic)::text
  union all select 'timeline: no event before the request existed', '0', (select count(*) from public.adoption_stage_history h join public.adoption_requests r on r.id = h.request_id where h.created_at < r.created_at)::text
)
select check_name, expected, actual, expected = actual as ok
from checks
order by ok, check_name;
