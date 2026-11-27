-- =========================================================
-- PawHome — ตรวจ Migration 001 (รันหลัง schema.sql + migrations/001_admin_workflow.sql)
-- อ่านอย่างเดียว: การลองเขียนทุกครั้ง rollback ตัวเอง · ผลลัพธ์ตารางเดียว ทุกแถวต้อง ok = true
-- ใช้ได้ทั้งฐานข้อมูลทดสอบและ Supabase Development (ต้องมีผู้ใช้ mind@pawhome.test / shelter@pawhome.test จาก seed:users)
-- =========================================================

drop table if exists pg_temp.admin_rls_results;
create temp table admin_rls_results (check_name text, expected text, actual text);
-- บันทึกผลได้ระหว่างสวมบท anon/authenticated (ตาราง temp นี้อยู่เฉพาะ session ที่รันไฟล์)
grant insert, select on admin_rls_results to anon, authenticated;

do $$
declare
  v_mind    uuid := (select id from auth.users where email = 'mind@pawhome.test');
  v_shelter uuid := (select id from auth.users where email = 'shelter@pawhome.test');
  v_pet     integer := (select min(id) from public.pets where owner_id = v_shelter);
  v_req     integer;
  outcome   text;
  n         integer;
begin
  -- เตรียม: โพสต์ที่ถูกซ่อน 1 ตัว + log 1 แถว (rollback ท้ายบล็อก)
  begin
    update public.pets set visibility = 'HIDDEN' where id = v_pet;

    -- ---------- anon ----------
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    select count(*) into n from public.pets where id = v_pet;
    insert into admin_rls_results values ('rls anon: hidden pet invisible', '0', n::text);
    begin
      if to_regclass('public.admin_audit_logs') is null then raise insufficient_privilege; end if; -- ลบแล้วใน 004
      select count(*) into n from public.admin_audit_logs;
      outcome := 'readable';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls anon: audit logs', 'blocked', outcome);
    execute 'reset role';

    -- ---------- authenticated = มายด์ (ผู้ใช้ทั่วไป) ----------
    perform set_config('request.jwt.claims', json_build_object('sub', v_mind, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    begin -- แต่งตั้งตัวเองเป็นผู้ดูแล
      insert into public.admin_memberships (user_id, role) values (v_mind, 'SUPER_ADMIN');
      outcome := 'allowed';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: self-grant admin role', 'blocked', outcome);

    begin -- ปลดการระงับบัญชีตัวเอง
      if to_regclass('public.user_suspensions') is null then raise insufficient_privilege; end if; -- ลบแล้วใน 004
      delete from public.user_suspensions where user_id = v_mind;
      outcome := 'allowed';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: delete own suspension', 'blocked', outcome);

    begin -- อ่าน audit log
      if to_regclass('public.admin_audit_logs') is null then raise insufficient_privilege; end if; -- ลบแล้วใน 004
      select count(*) into n from public.admin_audit_logs;
      outcome := 'readable';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: audit logs', 'blocked', outcome);

    begin -- อ่านบันทึกติดตามของผู้ดูแล
      select count(*) into n from public.adoption_follow_ups;
      outcome := 'readable';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: admin follow-up notes', 'blocked', outcome);

    begin -- ยื่นคำขอพร้อมตั้ง stage = COMPLETED เอง
      insert into public.adoption_requests (pet_id, user_id, phone, housing, message, status, stage)
      values (v_pet, v_mind, '0811111111', 'HOUSE', 'ข้ามขั้นตอน', 'PENDING', 'COMPLETED');
      outcome := 'allowed';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: insert request with stage', 'blocked', outcome);

    begin -- แก้ stage ของคำขอตัวเอง
      update public.adoption_requests set stage = 'COMPLETED' where user_id = v_mind;
      outcome := 'allowed';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: update request stage', 'blocked', outcome);

    begin -- แก้ visibility ของโพสต์ (ปลดการซ่อนเอง)
      update public.pets set visibility = 'VISIBLE' where owner_id = v_mind;
      outcome := 'allowed';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: update pet visibility', 'blocked', outcome);

    begin -- เขียนประกาศ
      insert into public.announcements (title) values ('ปลอม');
      outcome := 'allowed';
    exception when insufficient_privilege then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('rls user: insert announcement', 'blocked', outcome);

    select count(*) into n from public.pets where id = v_pet;
    insert into admin_rls_results values ('rls user: other''s hidden pet invisible', '0', n::text);
    execute 'reset role';

    -- ---------- เจ้าของเห็นโพสต์ที่ถูกซ่อนของตัวเอง ----------
    perform set_config('request.jwt.claims', json_build_object('sub', v_shelter, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.pets where id = v_pet;
    insert into admin_rls_results values ('rls owner: own hidden pet visible', '1', n::text);
    execute 'reset role';

    -- ---------- append-only (แม้แต่ role postgres) · ตารางถูกลบใน 004 = ไม่มีให้แก้ ----------
    if to_regclass('public.admin_audit_logs') is null then
      insert into admin_rls_results values ('audit log: update', 'blocked', 'blocked'), ('audit log: delete', 'blocked', 'blocked');
    else
      execute $q$insert into public.admin_audit_logs (action, target_type) values ('verify', 'system')$q$;
      begin
        execute $q$update public.admin_audit_logs set reason = 'แก้' where action = 'verify'$q$;
        outcome := 'allowed';
      exception when raise_exception then outcome := 'blocked';
      end;
      insert into admin_rls_results values ('audit log: update', 'blocked', outcome);
      begin
        execute $q$delete from public.admin_audit_logs where action = 'verify'$q$;
        outcome := 'allowed';
      exception when raise_exception then outcome := 'blocked';
      end;
      insert into admin_rls_results values ('audit log: delete', 'blocked', outcome);
    end if;

    -- ---------- constraint: status ต้องตรงกับ stage ----------
    select min(id) into v_req from public.adoption_requests;
    if v_req is null then
      outcome := 'blocked'; -- ไม่มีคำขอให้ทดสอบ (ฐานข้อมูลว่าง)
    else
      begin
        update public.adoption_requests set stage = 'COMPLETED', status = 'PENDING' where id = v_req;
        outcome := 'allowed';
      exception when check_violation then outcome := 'blocked';
      end;
    end if;
    insert into admin_rls_results values ('constraint: stage/status mismatch', 'blocked', outcome);

    begin
      insert into public.announcements (title, destination) values ('ลิงก์ภายนอก', 'https://evil.example');
      outcome := 'allowed';
    exception when check_violation then outcome := 'blocked';
    end;
    insert into admin_rls_results values ('constraint: external announcement destination', 'blocked', outcome);

    raise exception 'rollback';
  exception when raise_exception then
    if sqlerrm <> 'rollback' then raise; end if;
  end;
  execute 'reset role';
end;
$$;

with checks(check_name, expected, actual) as (
  select * from admin_rls_results

  -- โครงสร้าง
  union all select 'table: ' || t, 'true', (to_regclass('public.' || t) is not null)::text
  from unnest(array['admin_memberships', 'adoption_stage_history', 'adoption_handover_reports',
                    'adoption_follow_ups', 'notification_events', 'announcements']) t
  union all select 'rls enabled: ' || c.relname, 'true', c.relrowsecurity::text
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r'

  -- ข้อมูลสอดคล้อง
  union all select 'integrity: stage/status consistent', '0',
    (select count(*) from public.adoption_requests where not (
      (stage = 'PENDING' and status = 'PENDING')
      or (stage in ('ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'COMPLETED') and status = 'APPROVED')
      or (stage = status)))::text
  union all select 'integrity: completed request but pet not ADOPTED', '0',
    (select count(*) from public.adoption_requests a join public.pets p on p.id = a.pet_id
     where a.stage = 'COMPLETED' and p.status <> 'ADOPTED')::text
  union all select 'integrity: legacy APPROVED mapped to COMPLETED', '0',
    (select count(*) from public.adoption_stage_history h join public.adoption_requests a on a.id = h.request_id
     where h.actor_role = 'SYSTEM' and h.from_stage is null and a.stage = 'COMPLETED' and a.verified_at is null)::text
  union all select 'integrity: one placed request per pet', '0',
    (select count(*) from (select pet_id from public.adoption_requests
      where stage in ('ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'COMPLETED') group by pet_id having count(*) > 1) d)::text
)
select check_name, expected, actual, expected = actual as ok
from checks
order by ok, check_name;
