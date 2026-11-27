# Migration Plan — 001 / 002 / 003 (Expand → Contract)

สถานะ: **ทดสอบบน PGlite แล้ว · ยังไม่ได้ทดสอบบน Supabase Development · ยังไม่ได้รันบน Production**

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `database/migrations/001_admin_workflow.sql` | **Expand:** คอลัมน์/ตารางใหม่ + backfill (รันซ้ำได้ · ไม่มี DROP TABLE / TRUNCATE / DELETE ข้อมูลเดิม) · Backend รุ่นเดิมยังทำงานได้ |
| `database/migrations/002_notifications_announcements.sql` | แจ้งเตือนตามเหตุการณ์ + ประกาศตั้งเวลา/หมดอายุ · Backend รุ่นเดิมไม่ใช้ |
| `database/migrations/003_admin_workflow_contract.sql` | **Contract:** map แถวที่ Backend รุ่นเดิมเขียนระหว่างนั้น แล้วบังคับ `status` ตรงกับ `stage` · รันหลัง deploy Backend ใหม่เท่านั้น |
| `*.rollback.sql` ของแต่ละไฟล์ | ย้อนกลับ (ย้อนจาก 003 → 002 → 001 · ข้อมูลในตารางใหม่หาย — ต้อง export ก่อน) |
| `database/verification/verify-adoption-workflow.sql`, `verify-rls.sql` | ตรวจกฎขั้นตอนทั้งฐานข้อมูล / RLS (ใช้ร่วมกับชุดข้อมูลทดสอบได้) |
| `database/verification/verify-admin.sql` | ตรวจหลัง migrate · ทุกแถวต้อง `ok = true` |
| `database/verification/verify.sql` | ตรวจของเดิม (ปรับให้รองรับคอลัมน์ที่ migration เพิ่ม) |

## สิ่งที่เปลี่ยน

**`adoption_requests` (เพิ่มคอลัมน์ ไม่ลบของเดิม):**
- `stage`, `last_activity_at`, `follow_up_required`, `escalated`, `disputed`, `legacy_review`
- `handover_version`, `owner_confirmed_at`, `applicant_confirmed_at`, `completed_at`
- `verified_at`, `verified_by`, `resolution`, `closed_at`
- `status` เพิ่มค่า `CANCELLED`
- constraint `adoption_requests_stage_status_consistent` (บังคับ `status` ตรงกับ `stage`) อยู่ใน **003** ไม่ใช่ 001

**`pets`:** `visibility`, `moderation_reason`, `moderated_at`, `moderated_by`
- ค่าเริ่มต้น `VISIBLE` = โพสต์ใหม่แสดงทันทีเหมือนเดิม

**002:** `notification_events` อ้างคำขอหรือประกาศ (+ ชนิดแจ้งเตือนตามเหตุการณ์ · unique รวมผู้รับ) · `announcements.publish_at` / `expire_at` + policy อ่านเฉพาะที่อยู่ในช่วงเวลา

**ตารางใหม่ (001):** `admin_memberships`, `user_suspensions`, `adoption_stage_history`, `adoption_handover_reports`, `adoption_follow_ups`, `notification_events`, `admin_audit_logs` (append-only), `announcements`

**สิทธิ์และ RLS:**
- ตารางใหม่ทุกตารางเปิด RLS และ revoke สิทธิ์จาก anon / authenticated
- `adoption_requests` และ `pets` เปลี่ยนเป็นสิทธิ์รายคอลัมน์ (กันเขียน `stage` / `visibility` ตรงผ่าน PostgREST)
- policy อ่าน `pets` เปลี่ยนเป็น "VISIBLE หรือเป็นเจ้าของ"

## Backfill ข้อมูลเดิม (Legacy Mapping)

| status เดิม | stage ใหม่ | อื่น ๆ |
| --- | --- | --- |
| `PENDING` | `PENDING` | `last_activity_at = created_at` (นับเวลาเงียบจากวันที่ส่งคำขอ) |
| `APPROVED` | **`ACCEPTED`** (ไม่ใช่ COMPLETED) | `legacy_review = true` · `follow_up_required = true` · ไทม์ไลน์ SYSTEM "ย้ายข้อมูลจากระบบเดิม…" |
| `REJECTED` | `REJECTED` | ไทม์ไลน์ SYSTEM |

- สถานะน้องที่แสดงต่อสาธารณะไม่เปลี่ยน: Backend ถือว่า `legacy_review` = ได้บ้านแล้วชั่วคราว
- ผู้ดูแลต้องตัดสินแต่ละรายการ (พร้อมเหตุผล):
  - "ยืนยันว่าส่งมอบแล้ว" → `COMPLETED`
  - "ยังไม่ได้ส่งมอบ" → กลับไป `ACCEPTED` และน้องเป็น "มีคนขอ"
- รันซ้ำได้: map เฉพาะแถวที่ `stage` ยังเป็นค่าเริ่มต้น และเพิ่มไทม์ไลน์เฉพาะแถวที่ยังไม่มีประวัติ

## ลำดับการรัน (Supabase Development ก่อนเสมอ)

1. **สำรองข้อมูล:**
   - Supabase Dashboard → Database → Backups
   - หรือ `pg_dump` เฉพาะ schema `public`
2. ตรวจว่า Development มี `schema.sql` เวอร์ชันล่าสุด
3. **Expand:** รัน `001_admin_workflow.sql` แล้ว `002_notifications_announcements.sql`
   - Backend / Frontend รุ่นเดิมยังทำงานได้ตามปกติ (ทดสอบแล้วใน `database.test.ts`: อนุมัติแบบเดิมหลัง 001 ไม่ติด constraint)
4. รัน `verify.sql` และ `verify-admin.sql`
   - ต้องมีผู้ใช้ `mind@pawhome.test` / `shelter@pawhome.test` จาก `npm run seed:users` ถึงจะทดสอบส่วน RLS ได้
5. **Deploy Backend ใหม่** (ไป Preview ก่อน) · Frontend ใหม่ทนต่อ Backend เดิม และ Backend ใหม่ส่ง API เดิมครบ จึง deploy ฝั่งไหนก่อนก็ได้
6. **Contract:** รัน `003_admin_workflow_contract.sql`
   - map คำขอที่ Backend รุ่นเดิมอนุมัติ/ปฏิเสธระหว่างข้อ 3–5 เป็น `ACCEPTED + legacy_review` / `REJECTED` พร้อมไทม์ไลน์ SYSTEM
   - จากนั้นบังคับ constraint
7. รัน `verify-adoption-workflow.sql` + `verify-admin.sql`
8. แต่งตั้งผู้ดูแลด้วย [admin-super-admin-bootstrap.md](admin-super-admin-bootstrap.md)
9. ทดสอบตาม [admin-deployment-checklist.md](admin-deployment-checklist.md) · ทำซ้ำบน Production หลังได้รับอนุมัติ

> ⚠️ **ห้ามรัน 003 ก่อน Backend ใหม่ทำงาน:** Backend รุ่นเดิมอนุมัติคำขอด้วยการเขียน `status` อย่างเดียว ซึ่ง constraint ใน 003 จะปฏิเสธ
> ถ้าต้อง rollback Backend หลัง 003 → รัน `003_admin_workflow_contract.rollback.sql` ก่อน (เอา constraint ออก ไม่แตะข้อมูล)

### Emergency recovery

| อาการ | ทำ |
| --- | --- |
| อนุมัติคำขอไม่ได้ (error constraint) หลัง 003 | ตรวจว่า Backend ที่ทำงานเป็นรุ่นใหม่ · ถ้าต้องใช้รุ่นเดิม: รัน `003…rollback.sql` |
| หน้าแรกไม่มีประกาศ / แจ้งเตือนว่าง | ปกติถ้า Backend เดิม (Frontend ซ่อนฟีเจอร์เมื่อได้ 404) |
| ข้อมูลผิดหลัง migrate | หยุด deploy · ย้อน 003 → 002 → 001 ด้วย rollback ตามลำดับ · กู้จาก backup ถ้าจำเป็น |

## ตรวจหลัง migrate (สรุป)

```sql
-- ไม่มีอะไรถูกแปลงเป็น COMPLETED เอง
select count(*) from public.adoption_requests where stage = 'COMPLETED' and verified_at is null and completed_at is null;  -- ต้อง = 0
-- คำขอที่ต้องให้ผู้ดูแลตรวจ
select id, pet_id, status, stage from public.adoption_requests where legacy_review;
-- audit log แก้ไม่ได้ (ต้อง error)
update public.admin_audit_logs set reason = reason;
```

## Rollback

1. รัน `003_admin_workflow_contract.rollback.sql` (เอา constraint ออก) แล้ว Deploy Backend เวอร์ชันก่อน migration กลับไป
2. Export ตารางใหม่เก็บไว้ (CSV หรือ `pg_dump --table`)
3. รัน `002_notifications_announcements.rollback.sql` แล้ว `001_admin_workflow.rollback.sql` (แต่ละไฟล์ทำงานใน transaction เดียว)

ผลของ rollback:
- ตารางใหม่หาย
- `CANCELLED` → `REJECTED`
- คำขอที่ตอบรับแล้วคงเป็น `APPROVED` → ระบบเดิมถือว่าน้องได้บ้านแล้ว
- ซิงก์สถานะน้องตามกฎเดิม และคืนสิทธิ์/policy ตาม `schema.sql`

ทดสอบอัตโนมัติ (`backend/tests/database.test.ts`): migrate → rollback → migrate ซ้ำ ได้ผลถูกต้อง

## ผลทดสอบ

| ตรวจ | ผล | หมายเหตุ |
| --- | --- | --- |
| รันซ้ำ 2 รอบ (idempotent) | PASS | PGlite |
| Legacy APPROVED → ACCEPTED + review | PASS | PGlite |
| Rollback + migrate ซ้ำ | PASS | PGlite |
| `verify-admin.sql` (RLS / constraint / append-only) | PASS | PGlite + role จำลองจาก `tests/supabase-stub.sql` |
| RLS กับ Supabase Auth จริง (JWT จริง / PostgREST) | **BLOCKED** | ไม่มี Supabase Development credentials |
| Storage policy | **NOT TESTED** | migration ไม่แก้ Storage |
| เวลารันและการล็อกบนข้อมูลจริง | **NOT TESTED** | ต้องลองกับสำเนาข้อมูล |

ห้ามใช้ `prisma migrate` หรือ `prisma db push` · `backend/prisma/schema.prisma` เป็นแผนที่สำหรับ query เท่านั้น
