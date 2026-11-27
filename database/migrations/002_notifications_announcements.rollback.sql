-- ย้อนกลับ Migration 002 · ข้อมูลแจ้งเตือนของประกาศและแจ้งเตือนตามเหตุการณ์ถูกลบ (เหลือเฉพาะชนิดของ cron จาก 001)
begin;

delete from public.notification_events
where announcement_id is not null
   or kind not in ('OWNER_REMINDER', 'OWNER_SECOND_REMINDER', 'ADMIN_FOLLOW_UP', 'ESCALATION');

drop index if exists public.notification_events_request_unique;
drop index if exists public.notification_events_announcement_unique;
drop index if exists public.notification_events_unread_idx;
alter table public.notification_events drop constraint if exists notification_events_target_check;
alter table public.notification_events drop constraint if exists notification_events_kind_check;
alter table public.notification_events drop column if exists announcement_id, drop column if exists payload;
alter table public.notification_events alter column request_id set not null;
alter table public.notification_events add constraint notification_events_kind_check
  check (kind in ('OWNER_REMINDER', 'OWNER_SECOND_REMINDER', 'ADMIN_FOLLOW_UP', 'ESCALATION'));
alter table public.notification_events add constraint notification_events_request_id_kind_activity_at_key unique (request_id, kind, activity_at);

drop policy if exists "announcements: read published" on public.announcements;
create policy "announcements: read published" on public.announcements
  for select to anon, authenticated using (status = 'PUBLISHED');
alter table public.announcements drop constraint if exists announcements_window_check;
alter table public.announcements drop column if exists publish_at, drop column if exists expire_at;

commit;
