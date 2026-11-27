-- =========================================================
-- PawHome — Migration 003 (Contract): บังคับให้ status ตรงกับ stage
-- รัน **หลัง** deploy Backend ที่เขียน stage แล้วเท่านั้น (Backend รุ่นก่อน migration 001 จะอนุมัติคำขอไม่ได้หลังไฟล์นี้)
-- รันซ้ำได้ · ไม่ลบข้อมูล · ย้อนกลับ: 003_admin_workflow_contract.rollback.sql
-- =========================================================

begin;

-- 1) แถวที่ Backend รุ่นเดิมเขียนระหว่าง 001 กับการ deploy (status เปลี่ยน แต่ stage ยัง PENDING) → map แบบเดียวกับ 001
--    APPROVED เดิม = ACCEPTED + legacy_review (ไม่ใช่ COMPLETED)
with mapped as (
  update public.adoption_requests
  set stage = case status when 'APPROVED' then 'ACCEPTED' when 'REJECTED' then 'REJECTED' else 'CANCELLED' end,
      legacy_review = (status = 'APPROVED'),
      follow_up_required = (status = 'APPROVED'),
      last_activity_at = updated_at
  where stage = 'PENDING' and status <> 'PENDING'
  returning id, stage, legacy_review, updated_at
)
insert into public.adoption_stage_history (request_id, from_stage, to_stage, actor_role, note, created_at)
select id, 'PENDING', stage, 'SYSTEM',
  case when legacy_review then 'ย้ายข้อมูลจาก Backend รุ่นเดิม: อนุมัติแล้วแต่ไม่มีหลักฐานส่งมอบ ต้องให้ผู้ดูแลยืนยัน'
       else 'ย้ายข้อมูลจาก Backend รุ่นเดิม' end,
  updated_at
from mapped;

-- 2) บังคับให้ status ตรงกับ stage เสมอ (กัน client เก่าหรือ PostgREST เขียนค่าที่ขัดกัน)
alter table public.adoption_requests drop constraint if exists adoption_requests_stage_status_consistent;
alter table public.adoption_requests add constraint adoption_requests_stage_status_consistent check (
  (stage = 'PENDING' and status = 'PENDING')
  or (stage in ('ACCEPTED', 'ARRANGING_HANDOVER', 'HANDOVER_REPORTED', 'COMPLETED') and status = 'APPROVED')
  or (stage = 'REJECTED' and status = 'REJECTED')
  or (stage = 'CANCELLED' and status = 'CANCELLED')
);

commit;
