-- =========================================================
-- ย้อนกลับ Migration 001 (ใช้เมื่อจำเป็นเท่านั้น · ต้องสำรองฐานข้อมูลก่อน)
-- ผลที่ต้องรู้ก่อนรัน:
--   - ข้อมูลในตารางใหม่หายทั้งหมด: ประวัติขั้นตอน รายงานส่งมอบ บันทึกติดตาม แจ้งเตือน ประกาศ ผู้ดูแล การระงับบัญชี audit log
--     (export ตารางเหล่านี้เก็บไว้ก่อน: ดู docs/admin-migration-plan.md)
--   - คำขอที่ status = CANCELLED จะกลายเป็น REJECTED (ระบบเดิมไม่มีสถานะนี้)
--   - คำขอ ACCEPTED/ARRANGING/HANDOVER_REPORTED คงเป็น APPROVED → ระบบเดิมถือว่าน้องได้บ้านแล้ว (ตรงกับพฤติกรรมเดิม)
--   - ต้อง deploy Backend เวอร์ชันก่อน migration กลับไปก่อน แล้วค่อยรันไฟล์นี้
-- =========================================================
begin;

-- ระบบเดิม: มีคำขอ APPROVED = น้องได้บ้านแล้ว → ซิงก์สถานะน้องให้ตรงกฎเดิมหลังลบคอลัมน์
update public.adoption_requests set status = 'REJECTED' where status = 'CANCELLED';

drop table if exists public.notification_events;
drop table if exists public.adoption_follow_ups;
drop table if exists public.adoption_handover_reports;
drop table if exists public.adoption_stage_history;
drop table if exists public.user_suspensions;
drop table if exists public.admin_memberships;
drop table if exists public.announcements;
drop trigger if exists admin_audit_logs_append_only on public.admin_audit_logs;
drop trigger if exists admin_audit_logs_no_truncate on public.admin_audit_logs;
drop table if exists public.admin_audit_logs;
drop function if exists public.reject_audit_log_change();

alter table public.adoption_requests drop constraint if exists adoption_requests_stage_status_consistent;
alter table public.adoption_requests drop constraint if exists adoption_requests_legacy_review_stage;
alter table public.adoption_requests drop constraint if exists adoption_requests_stage_check;
alter table public.adoption_requests drop constraint if exists adoption_requests_resolution_check;
drop index if exists public.adoption_requests_stage_activity_idx;
alter table public.adoption_requests
  drop column if exists stage, drop column if exists last_activity_at, drop column if exists follow_up_required,
  drop column if exists escalated, drop column if exists disputed, drop column if exists legacy_review,
  drop column if exists handover_version, drop column if exists owner_confirmed_at, drop column if exists applicant_confirmed_at,
  drop column if exists completed_at, drop column if exists verified_at, drop column if exists verified_by,
  drop column if exists resolution, drop column if exists closed_at;
alter table public.adoption_requests drop constraint if exists adoption_requests_status_check;
alter table public.adoption_requests add constraint adoption_requests_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED'));

update public.pets p set status = case
  when exists (select 1 from public.adoption_requests a where a.pet_id = p.id and a.status = 'APPROVED') then 'ADOPTED'
  when exists (select 1 from public.adoption_requests a where a.pet_id = p.id and a.status = 'PENDING') then 'PENDING'
  else 'AVAILABLE' end;

drop policy if exists "pets: read visible or own" on public.pets;
drop index if exists public.pets_visibility_idx;
alter table public.pets drop constraint if exists pets_visibility_check;
alter table public.pets drop constraint if exists pets_moderation_reason_check;
alter table public.pets
  drop column if exists visibility, drop column if exists moderation_reason,
  drop column if exists moderated_at, drop column if exists moderated_by;

-- คืนสิทธิ์และ policy ตาม database/schema.sql
grant select, insert, update, delete on public.pets, public.adoption_requests to authenticated;
drop policy if exists "pets: read all" on public.pets;
create policy "pets: read all" on public.pets for select to anon, authenticated using (true);

-- _prisma_migrations: คงการปิดสิทธิ์ anon/authenticated ไว้ (เป็นการแก้ช่องโหว่ ไม่ใช่ส่วนของฟีเจอร์)

commit;
