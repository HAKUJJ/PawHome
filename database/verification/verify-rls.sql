-- =========================================================
-- PawHome — ตรวจ RLS ด้วยผู้ใช้ในชุดข้อมูลทดสอบ (หลัง migrations + database/seeds/*) · ทุกการลองเขียน rollback ตัวเอง
-- สวมบท anon / authenticated ผ่าน request.jwt.claims เหมือน PostgREST · ทุกแถวต้อง ok = true
-- หมายเหตุ: PGlite ใช้ auth.uid() จำลอง (tests/supabase-stub.sql) — บน Supabase Development ให้รันซ้ำเพื่อยืนยันกับ auth จริง
--           และทดสอบผ่าน PostgREST ด้วย JWT จริงเพิ่ม (ดู docs/admin-deployment-checklist.md)
-- =========================================================
drop table if exists pg_temp.rls_demo_results;
create temp table rls_demo_results (check_name text, expected text, actual text);
grant insert, select on rls_demo_results to anon, authenticated;

do $$
declare
  v_owner     uuid := (select id from auth.users where email like 'demo-07.%@pawhome.test');  -- เจ้าของที่มีคำขอรออยู่
  v_applicant uuid := (select id from auth.users where email like 'demo-22.%@pawhome.test');  -- ผู้ขอหลายครั้ง
  v_stranger  uuid := (select id from auth.users where email like 'demo-21.%@pawhome.test');  -- เพิ่งสมัคร ไม่มีโพสต์/คำขอ
  owner_requests int := (select count(*) from public.adoption_requests r join public.pets p on p.id = r.pet_id where p.owner_id = v_owner);
  applicant_requests int := (select count(*) from public.adoption_requests where user_id = v_applicant);
  applicant_reports int := (select count(*) from public.adoption_handover_reports h join public.adoption_requests r on r.id = h.request_id where r.user_id = v_applicant);
  stranger_notifications int := (select count(*) from public.notification_events where recipient_id = v_stranger);
  live_announcements int := (select count(*) from public.announcements
    where status = 'PUBLISHED' and (publish_at is null or publish_at <= now()) and (expire_at is null or expire_at > now()));
  n int;
  outcome text;
begin
  if v_owner is null or v_applicant is null or v_stranger is null then
    raise exception 'ไม่พบผู้ใช้ทดสอบ demo-07 / demo-22 / demo-21 — รัน seed ก่อน';
  end if;

  -- ---------- anon ----------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from public.pets where visibility <> 'VISIBLE';
  insert into rls_demo_results values ('anon: hidden/changes/review pets invisible', '0', n::text);
  select count(*) into n from public.adoption_requests;
  insert into rls_demo_results values ('anon: adoption requests (phones) invisible', '0', n::text);
  select count(*) into n from public.announcements;
  insert into rls_demo_results values ('anon: only live announcements (no draft/scheduled/expired)', live_announcements::text, n::text);
  begin select count(*) into n from public.notification_events; outcome := n::text;
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('anon: notifications', 'blocked', outcome);
  execute 'reset role';

  -- ---------- ผู้ใช้ที่ไม่มีส่วนเกี่ยวข้อง ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.adoption_requests;
  insert into rls_demo_results values ('stranger: sees no one else''s requests', '0', n::text);
  select count(*) into n from public.adoption_handover_reports;
  insert into rls_demo_results values ('stranger: sees no handover reports', '0', n::text);
  select count(*) into n from public.adoption_stage_history;
  insert into rls_demo_results values ('stranger: sees no timelines', '0', n::text);
  select count(*) into n from public.notification_events;
  insert into rls_demo_results values ('stranger: sees only own notifications', stranger_notifications::text, n::text);
  begin
    update public.notification_events set read_at = now() where recipient_id <> v_stranger;
    outcome := 'allowed';
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('stranger: mark others'' notifications read', 'blocked', outcome);
  begin
    insert into public.notification_events (recipient_id, kind, request_id, activity_at) values (v_stranger, 'NEW_REQUEST', 3001, now());
    outcome := 'allowed';
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('stranger: insert notifications directly', 'blocked', outcome);
  begin select count(*) into n from public.adoption_follow_ups; outcome := n::text;
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('stranger: admin follow-up notes', 'blocked', outcome);
  begin if to_regclass('public.admin_audit_logs') is null then raise insufficient_privilege; end if; -- ลบแล้วใน 004
    select count(*) into n from public.admin_audit_logs; outcome := n::text;
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('stranger: audit logs', 'blocked', outcome);
  begin
    update public.pets set visibility = 'VISIBLE' where visibility <> 'VISIBLE';
    outcome := 'allowed';
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('stranger: unhide pets', 'blocked', outcome);
  execute 'reset role';

  -- ---------- เจ้าของ: เห็นคำขอของน้องตัวเองเท่านั้น ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.adoption_requests r join public.pets p on p.id = r.pet_id where p.owner_id = v_owner;
  insert into rls_demo_results values ('owner: sees requests for own pets', owner_requests::text, n::text);
  select count(*) into n from public.adoption_requests r join public.pets p on p.id = r.pet_id where p.owner_id <> v_owner and r.user_id <> v_owner;
  insert into rls_demo_results values ('owner: sees no other owners'' requests', '0', n::text);
  begin
    update public.adoption_requests set stage = 'COMPLETED' where pet_id in (select id from public.pets where owner_id = v_owner);
    outcome := 'allowed';
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('owner: set stage directly (bypass workflow)', 'blocked', outcome);
  execute 'reset role';

  -- ---------- ผู้ขอ: เห็นคำขอ/รายงานของตัวเอง ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_applicant, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.adoption_requests where user_id = v_applicant;
  insert into rls_demo_results values ('applicant: sees own requests', applicant_requests::text, n::text);
  select count(*) into n from public.adoption_handover_reports h join public.adoption_requests r on r.id = h.request_id where r.user_id = v_applicant;
  insert into rls_demo_results values ('applicant: sees own handover reports', applicant_reports::text, n::text);
  begin
    insert into public.admin_memberships (user_id, role) values (v_applicant, 'SUPER_ADMIN');
    outcome := 'allowed';
  exception when insufficient_privilege then outcome := 'blocked'; end;
  insert into rls_demo_results values ('applicant: self-promote to SUPER_ADMIN', 'blocked', outcome);
  execute 'reset role';
end;
$$;

with checks(check_name, expected, actual) as (
  select * from rls_demo_results
  union all select 'rls enabled: ' || c.relname, 'true', c.relrowsecurity::text
  from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'
  union all select 'policy exists: ' || p, 'true', exists (select 1 from pg_policies where schemaname = 'public' and policyname = p)::text
  from unnest(array['pets: read visible or own', 'adoptions: read own or pet owner', 'notification_events: own', 'announcements: read published',
                    'handover_reports: participants', 'stage_history: participants', 'admin_memberships: read own']) p
)
select check_name, expected, actual, expected = actual as ok
from checks
order by ok, check_name;
