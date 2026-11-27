-- =========================================================
-- PawHome — Migration 001: Admin RBAC + ขั้นตอนรับเลี้ยงแบบส่งมอบจริง + ติดตามเคส + ประกาศ + Audit Log
-- รันหลัง database/schema.sql · รันซ้ำได้ (idempotent) · ไม่มี DROP TABLE / TRUNCATE / DELETE ข้อมูลเดิม
-- ห้ามรันบน Production จนกว่าจะผ่าน Supabase Development + backup (ดู docs/admin-migration-plan.md)
-- ย้อนกลับ: database/migrations/001_admin_workflow.rollback.sql
-- =========================================================

begin;

-- ---------- 1. adoption_requests: stage ใหม่ (คู่กับ status เดิมเพื่อความเข้ากันได้) ----------
alter table public.adoption_requests
  add column if not exists stage                   text        not null default 'PENDING',
  add column if not exists last_activity_at        timestamptz, -- เติมค่าให้แถวเดิมด้านล่างก่อน แล้วค่อยตั้ง not null
  add column if not exists follow_up_required      boolean     not null default false,
  add column if not exists escalated               boolean     not null default false,
  add column if not exists disputed                boolean     not null default false,
  add column if not exists legacy_review           boolean     not null default false,
  add column if not exists handover_version        integer     not null default 0,
  add column if not exists owner_confirmed_at      timestamptz,
  add column if not exists applicant_confirmed_at  timestamptz,
  add column if not exists completed_at            timestamptz,
  add column if not exists verified_at             timestamptz,
  add column if not exists verified_by             uuid references public.profiles (id) on delete set null,
  add column if not exists resolution              text        not null default '',
  add column if not exists closed_at               timestamptz;

alter table public.adoption_requests drop constraint if exists adoption_requests_stage_check;
alter table public.adoption_requests add constraint adoption_requests_stage_check
  check (stage in ('PENDING', 'ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'COMPLETED', 'REJECTED', 'CANCELLED'));

-- status เดิมเพิ่ม CANCELLED (ยกเลิกหลังเจ้าของตอบรับแล้ว — เดิมยกเลิกได้เฉพาะ PENDING ซึ่งลบแถวทิ้ง)
alter table public.adoption_requests drop constraint if exists adoption_requests_status_check;
alter table public.adoption_requests add constraint adoption_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));

alter table public.adoption_requests drop constraint if exists adoption_requests_resolution_check;
alter table public.adoption_requests add constraint adoption_requests_resolution_check check (char_length(resolution) <= 2000);

-- ---------- 2. Backfill ข้อมูลเดิม (เฉพาะแถวที่ยังไม่เคย map: stage ยังเป็นค่าเริ่มต้น แต่ status ไม่ใช่ PENDING) ----------
-- กฎสำคัญ: APPROVED เดิม ≠ COMPLETED (ไม่มีหลักฐานส่งมอบ) → ACCEPTED + legacy_review + ต้องติดตาม
-- สถานะน้องที่แสดงต่อสาธารณะ (ADOPTED) คงไว้จนผู้ดูแลตรวจ — Backend ถือว่า legacy_review = ได้บ้านแล้วชั่วคราว
update public.adoption_requests
set stage = case status when 'APPROVED' then 'ACCEPTED' when 'REJECTED' then 'REJECTED' else 'CANCELLED' end,
    legacy_review = (status = 'APPROVED'),
    follow_up_required = (status = 'APPROVED')
where stage = 'PENDING' and status <> 'PENDING';

-- เวลาเงียบ: PENDING นับจากตอนส่งคำขอ · ที่เหลือนับจากการเปลี่ยนแปลงล่าสุด (ไม่ใช่เวลาที่รัน migration)
update public.adoption_requests
set last_activity_at = case when status = 'PENDING' then created_at else updated_at end
where last_activity_at is null;
alter table public.adoption_requests alter column last_activity_at set default now();
alter table public.adoption_requests alter column last_activity_at set not null;

-- Expand/Contract: constraint "status ต้องตรงกับ stage" อยู่ใน 003_admin_workflow_contract.sql
-- เพราะ Backend รุ่นเดิมเขียน status อย่างเดียว — ถ้าใส่ constraint ตอนนี้ Production เดิมจะอนุมัติคำขอไม่ได้
-- ลำดับ: 001 (expand) → deploy Backend ใหม่ → 003 (contract: map แถวที่ Backend เดิมเขียนระหว่างนั้น แล้วใส่ constraint)
-- legacy_review ใช้ได้เฉพาะคำขอที่ตอบรับแล้ว (คอลัมน์ใหม่ Backend เดิมไม่แตะ)
alter table public.adoption_requests drop constraint if exists adoption_requests_legacy_review_stage;
alter table public.adoption_requests add constraint adoption_requests_legacy_review_stage
  check (not legacy_review or stage in ('ACCEPTED', 'COMPLETED'));

-- คิวติดตาม: คำขอที่ยังไม่จบ เรียงตามเวลาเงียบ
create index if not exists adoption_requests_stage_activity_idx on public.adoption_requests (stage, last_activity_at);
-- (หนึ่งน้องตอบรับได้คนเดียว: adoption_requests_one_approved_per_pet บน status = 'APPROVED' ครอบคลุมทุก stage ที่ตอบรับแล้ว)

-- ---------- 3. pets: ผลตรวจโพสต์ (ไม่มี pre-moderation: โพสต์ใหม่แสดงทันทีเหมือนเดิม) ----------
alter table public.pets
  add column if not exists visibility        text        not null default 'VISIBLE',
  add column if not exists moderation_reason text        not null default '',
  add column if not exists moderated_at      timestamptz,
  add column if not exists moderated_by      uuid references public.profiles (id) on delete set null;

alter table public.pets drop constraint if exists pets_visibility_check;
alter table public.pets add constraint pets_visibility_check
  check (visibility in ('VISIBLE', 'HIDDEN', 'CHANGES_REQUESTED', 'REVIEW'));
alter table public.pets drop constraint if exists pets_moderation_reason_check;
alter table public.pets add constraint pets_moderation_reason_check check (char_length(moderation_reason) <= 500);

create index if not exists pets_visibility_idx on public.pets (visibility) where visibility <> 'VISIBLE';

-- ---------- 4. ตารางใหม่ ----------
-- ผู้ดูแล: ไม่มีแถว = USER · แยกจาก profiles เพราะ profiles มี policy "update own" (ผู้ใช้จะแก้ role ตัวเองได้)
create table if not exists public.admin_memberships (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  role        text not null check (role in ('ADMIN', 'SUPER_ADMIN')),
  granted_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.user_suspensions (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  reason        text not null check (char_length(btrim(reason)) between 1 and 500),
  suspended_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.adoption_stage_history (
  id          bigint generated by default as identity primary key,
  request_id  integer not null references public.adoption_requests (id) on delete cascade,
  from_stage  text,
  to_stage    text not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  text not null check (actor_role in ('OWNER', 'APPLICANT', 'ADMIN', 'SYSTEM')),
  note        text not null default '' check (char_length(note) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists adoption_stage_history_request_idx on public.adoption_stage_history (request_id, id);

-- ไทม์ไลน์ของคำขอที่ย้ายมาจากระบบเดิม (เฉพาะแถวที่ยังไม่มีประวัติเลย → รันซ้ำไม่เพิ่มซ้ำ)
insert into public.adoption_stage_history (request_id, from_stage, to_stage, actor_role, note, created_at)
select a.id, null, a.stage, 'SYSTEM',
  case when a.legacy_review then 'ย้ายข้อมูลจากระบบเดิม: อนุมัติแล้วแต่ไม่มีหลักฐานส่งมอบ ต้องให้ผู้ดูแลยืนยัน'
       else 'ย้ายข้อมูลจากระบบเดิม' end,
  a.last_activity_at
from public.adoption_requests a
where a.stage <> 'PENDING'
  and not exists (select 1 from public.adoption_stage_history h where h.request_id = a.id);

-- เก็บทุกรายงาน (ประวัติ) · รายงานล่าสุดของแต่ละฝ่าย = id มากสุด
create table if not exists public.adoption_handover_reports (
  id             bigint generated by default as identity primary key,
  request_id     integer not null references public.adoption_requests (id) on delete cascade,
  party          text not null check (party in ('OWNER', 'APPLICANT')),
  handover_date  date not null,
  outcome        text not null check (outcome in ('HANDED_OVER', 'NOT_HANDED_OVER')),
  note           text not null default '' check (char_length(note) <= 1000),
  evidence_url   text not null default '' check (char_length(evidence_url) <= 2048),
  version        integer not null,
  reporter_id    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists adoption_handover_reports_request_idx on public.adoption_handover_reports (request_id, party, id desc);

-- บันทึกของผู้ดูแล (ภายในเท่านั้น ไม่แสดงให้เจ้าของ/ผู้ขอ)
create table if not exists public.adoption_follow_ups (
  id          bigint generated by default as identity primary key,
  request_id  integer not null references public.adoption_requests (id) on delete cascade,
  kind        text not null check (kind in ('FLAG', 'UNFLAG', 'CONTACT', 'NOTE', 'ESCALATE', 'RESOLVE', 'DISPUTE', 'VERIFY', 'REOPEN', 'CLOSE')),
  note        text not null default '' check (char_length(note) <= 2000),
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists adoption_follow_ups_request_idx on public.adoption_follow_ups (request_id, id);

-- เหตุการณ์แจ้งเตือน (ยังไม่ส่งอีเมล/SMS) · unique กันสร้างซ้ำเมื่อ cron รันหลายรอบ (นับรอบจาก activity_at)
create table if not exists public.notification_events (
  id            bigint generated by default as identity primary key,
  request_id    integer not null references public.adoption_requests (id) on delete cascade,
  recipient_id  uuid references public.profiles (id) on delete cascade, -- null = คิวผู้ดูแล
  kind          text not null check (kind in ('OWNER_REMINDER', 'OWNER_SECOND_REMINDER', 'ADMIN_FOLLOW_UP', 'ESCALATION')),
  activity_at   timestamptz not null,
  channel       text not null default 'IN_APP' check (channel in ('IN_APP')),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (request_id, kind, activity_at)
);
create index if not exists notification_events_recipient_idx on public.notification_events (recipient_id, created_at desc);

create table if not exists public.admin_audit_logs (
  id           bigint generated by default as identity primary key,
  actor_id     uuid,            -- ไม่มี FK: ลบผู้ใช้แล้ว log ต้องยังอยู่ครบ (append-only ห้าม update เป็น null)
  actor_role   text not null default '',
  action       text not null check (char_length(action) between 1 and 100),
  target_type  text not null check (char_length(target_type) between 1 and 50),
  target_id    text not null default '',
  result       text not null default 'SUCCESS' check (result in ('SUCCESS', 'DENIED', 'FAILED')),
  changes      jsonb not null default '{}'::jsonb,
  reason       text not null default '' check (char_length(reason) <= 2000),
  created_at   timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);

create table if not exists public.announcements (
  id             integer generated by default as identity primary key,
  title          text not null check (char_length(btrim(title)) between 1 and 200),
  category       text not null default '' check (char_length(category) <= 60),
  description    text not null default '' check (char_length(description) <= 5000),
  event_date     date,
  event_time     text not null default '' check (char_length(event_time) <= 60),
  location       text not null default '' check (char_length(location) <= 300),
  contact        text not null default '' check (char_length(contact) <= 500),
  cta            text not null default '' check (char_length(cta) <= 60),
  -- ปลายทางในเว็บเท่านั้น ("/" หรือ "/path") กัน open redirect / javascript: URL
  destination    text not null default '/' check (destination ~ '^/([A-Za-z0-9._~-][A-Za-z0-9._~/?=&#%-]*)?$'),
  image_url      text not null default '' check (char_length(image_url) <= 2048),
  status         text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  display_order  integer not null default 0,
  is_demo        boolean not null default false,
  published_at   timestamptz,
  created_by     uuid references public.profiles (id) on delete set null,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists announcements_published_idx on public.announcements (display_order, id) where status = 'PUBLISHED';

drop trigger if exists admin_memberships_set_updated_at on public.admin_memberships;
create trigger admin_memberships_set_updated_at before update on public.admin_memberships
  for each row execute function public.set_updated_at();
drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- ---------- 5. Audit log แบบ append-only (กันทุก role รวม postgres/service role) ----------
create or replace function public.reject_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_logs เป็น append-only: แก้ไขหรือลบไม่ได้';
end;
$$;

drop trigger if exists admin_audit_logs_append_only on public.admin_audit_logs;
create trigger admin_audit_logs_append_only before update or delete on public.admin_audit_logs
  for each row execute function public.reject_audit_log_change();
drop trigger if exists admin_audit_logs_no_truncate on public.admin_audit_logs;
create trigger admin_audit_logs_no_truncate before truncate on public.admin_audit_logs
  for each statement execute function public.reject_audit_log_change();

-- ---------- 6. สิทธิ์ + RLS ----------
-- Backend ต่อด้วย role postgres (Prisma) จึงข้าม RLS และตรวจสิทธิ์เองในโค้ด
-- ส่วนนี้กันการยิงตรงผ่าน PostgREST ด้วย anon key / token ผู้ใช้

-- คอลัมน์ใหม่ห้ามเขียนตรง: เปลี่ยนจากสิทธิ์ทั้งตาราง เป็นสิทธิ์รายคอลัมน์เดิมเท่านั้น
revoke insert, update on public.adoption_requests from anon, authenticated;
grant insert (pet_id, user_id, phone, housing, message, status) on public.adoption_requests to authenticated;
grant update (status) on public.adoption_requests to authenticated;

revoke insert, update on public.pets from anon, authenticated;
grant insert (owner_id, name, species, breed, age_months, sex, province, image_url, description, vaccinated, sterilized, urgent, status)
  on public.pets to authenticated;
grant update (name, species, breed, age_months, sex, province, image_url, description, vaccinated, sterilized, urgent, status)
  on public.pets to authenticated;

-- โพสต์ที่ถูกซ่อน/ส่งกลับแก้ไข: เห็นเฉพาะเจ้าของ
drop policy if exists "pets: read all" on public.pets;
drop policy if exists "pets: read visible or own" on public.pets;
create policy "pets: read visible or own" on public.pets
  for select to anon, authenticated using (visibility = 'VISIBLE' or (select auth.uid()) = owner_id);

-- ตารางใหม่: ไม่ให้ anon/authenticated เขียนตรงเลย (เขียนผ่าน Backend เท่านั้น)
revoke all on public.admin_memberships, public.user_suspensions, public.adoption_stage_history,
  public.adoption_handover_reports, public.adoption_follow_ups, public.notification_events,
  public.admin_audit_logs, public.announcements from anon, authenticated;

alter table public.admin_memberships         enable row level security;
alter table public.user_suspensions          enable row level security;
alter table public.adoption_stage_history    enable row level security;
alter table public.adoption_handover_reports enable row level security;
alter table public.adoption_follow_ups       enable row level security;
alter table public.notification_events       enable row level security;
alter table public.admin_audit_logs          enable row level security;
alter table public.announcements             enable row level security;

grant select on public.admin_memberships, public.user_suspensions, public.adoption_stage_history,
  public.adoption_handover_reports, public.notification_events to authenticated;
grant select on public.announcements to anon, authenticated;
-- admin_audit_logs, adoption_follow_ups: ไม่มี grant และไม่มี policy → อ่านไม่ได้จาก PostgREST

drop policy if exists "admin_memberships: read own" on public.admin_memberships;
create policy "admin_memberships: read own" on public.admin_memberships
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_suspensions: read own" on public.user_suspensions;
create policy "user_suspensions: read own" on public.user_suspensions
  for select to authenticated using ((select auth.uid()) = user_id);

-- ไทม์ไลน์และรายงานส่งมอบ: เห็นเฉพาะผู้ขอและเจ้าของน้อง
drop policy if exists "stage_history: participants" on public.adoption_stage_history;
create policy "stage_history: participants" on public.adoption_stage_history
  for select to authenticated using (exists (
    select 1 from public.adoption_requests a join public.pets p on p.id = a.pet_id
    where a.id = request_id and (a.user_id = (select auth.uid()) or p.owner_id = (select auth.uid()))
  ));

drop policy if exists "handover_reports: participants" on public.adoption_handover_reports;
create policy "handover_reports: participants" on public.adoption_handover_reports
  for select to authenticated using (exists (
    select 1 from public.adoption_requests a join public.pets p on p.id = a.pet_id
    where a.id = request_id and (a.user_id = (select auth.uid()) or p.owner_id = (select auth.uid()))
  ));

drop policy if exists "notification_events: own" on public.notification_events;
create policy "notification_events: own" on public.notification_events
  for select to authenticated using ((select auth.uid()) = recipient_id);

drop policy if exists "announcements: read published" on public.announcements;
create policy "announcements: read published" on public.announcements
  for select to anon, authenticated using (status = 'PUBLISHED');

grant usage on all sequences in schema public to authenticated;

-- ตารางประวัติ migration ของ Prisma (ถ้ามี) อยู่ใน public และได้ default grant ของ Supabase → anon อ่าน/เขียน/ลบผ่าน PostgREST ได้
-- ปิดไว้: Prisma ต่อด้วย role เจ้าของตาราง จึงไม่กระทบ
do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    execute 'revoke all on public._prisma_migrations from anon, authenticated';
    execute 'alter table public._prisma_migrations enable row level security';
  end if;
end;
$$;

commit;
