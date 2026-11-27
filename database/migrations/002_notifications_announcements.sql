-- =========================================================
-- PawHome — Migration 002: แจ้งเตือนในเว็บตามเหตุการณ์ + ประกาศแบบตั้งเวลา/หมดอายุ
-- รันหลัง 001 · รันซ้ำได้ · ไม่ลบข้อมูล · Backend รุ่นเดิมไม่ใช้ตารางเหล่านี้ (ปลอดภัยต่อ Production เดิม)
-- ย้อนกลับ: 002_notifications_announcements.rollback.sql
-- =========================================================

begin;

-- ---------- 1. notification_events: เหตุการณ์ของคำขอ + ประกาศ ----------
alter table public.notification_events
  alter column request_id drop not null,
  add column if not exists announcement_id integer references public.announcements (id) on delete cascade,
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.notification_events drop constraint if exists notification_events_kind_check;
alter table public.notification_events add constraint notification_events_kind_check check (kind in (
  -- จาก cron (เวลาเงียบของเจ้าของ)
  'OWNER_REMINDER', 'OWNER_SECOND_REMINDER', 'ADMIN_FOLLOW_UP', 'ESCALATION',
  -- จากการกระทำในขั้นตอนรับเลี้ยง
  'NEW_REQUEST', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_CANCELLED', 'HANDOVER_ARRANGED',
  'HANDOVER_REPORTED', 'HANDOVER_CONFIRMED', 'HANDOVER_DISPUTED', 'ADOPTION_COMPLETED',
  -- ประกาศ
  'ANNOUNCEMENT_PUBLISHED'
));

-- อ้างถึงคำขอ หรือ ประกาศ อย่างใดอย่างหนึ่งเท่านั้น
alter table public.notification_events drop constraint if exists notification_events_target_check;
alter table public.notification_events add constraint notification_events_target_check
  check (num_nonnulls(request_id, announcement_id) = 1);

-- กันสร้างซ้ำ (cron / การกดซ้ำ / seed รันซ้ำ): เดิมไม่รวมผู้รับ → แจ้งสองฝ่ายพร้อมกันชนกัน จึงเปลี่ยนเป็นรวมผู้รับ
alter table public.notification_events drop constraint if exists notification_events_request_id_kind_activity_at_key;
create unique index if not exists notification_events_request_unique
  on public.notification_events (request_id, kind, activity_at, coalesce(recipient_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where request_id is not null;
create unique index if not exists notification_events_announcement_unique
  on public.notification_events (announcement_id, recipient_id, kind)
  where announcement_id is not null;
create index if not exists notification_events_unread_idx on public.notification_events (recipient_id) where read_at is null;

-- ---------- 2. announcements: ตั้งเวลาเผยแพร่ / หมดอายุ ----------
alter table public.announcements
  add column if not exists publish_at timestamptz,
  add column if not exists expire_at  timestamptz;
alter table public.announcements drop constraint if exists announcements_window_check;
alter table public.announcements add constraint announcements_window_check
  check (expire_at is null or publish_at is null or expire_at > publish_at);

-- หน้าเว็บเห็นเฉพาะที่เผยแพร่และอยู่ในช่วงเวลา
drop policy if exists "announcements: read published" on public.announcements;
create policy "announcements: read published" on public.announcements
  for select to anon, authenticated using (
    status = 'PUBLISHED' and (publish_at is null or publish_at <= now()) and (expire_at is null or expire_at > now())
  );

commit;
