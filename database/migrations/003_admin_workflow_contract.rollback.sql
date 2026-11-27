-- ย้อนกลับ Migration 003: เอา constraint status/stage ออก (ใช้ก่อน rollback Backend ไปรุ่นที่เขียน status อย่างเดียว)
-- ไม่แตะข้อมูล
alter table public.adoption_requests drop constraint if exists adoption_requests_stage_status_consistent;
