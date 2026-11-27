# ข้อเสนอ Backend สำหรับ Admin และขั้นตอนรับเลี้ยง (รอบถัดไป)

สถานะ: **ข้อเสนอเดิม (ก่อนพัฒนา)** — พัฒนาแล้วโดยปรับรายละเอียดบางส่วน · สัญญาที่ใช้จริงดู [admin-fullstack-implementation.md](admin-fullstack-implementation.md) และ `backend/src/routes/admin.ts`

ความต่างหลักจากข้อเสนอ: ใช้ตาราง `admin_memberships` แทน `profiles.role` · `suspended` เป็นตาราง `user_suspensions` · ตาราง `case_events` แยกเป็น `adoption_stage_history` + `adoption_follow_ups` + `admin_audit_logs` · การยืนยันเก็บใน `adoption_requests` (`*_confirmed_at` + `handover_version`) · endpoint ผู้ดูแลอยู่ใต้ `/admin/adoptions/*` ไม่ใช่ `/admin/cases/*` · ตอบรับยังใช้ `PATCH /adoptions/:id` เดิม

## 1. ปัญหาของระบบปัจจุบัน
Backend ตอนนี้: เจ้าของ "อนุมัติ" (`PATCH /adoptions/:id` → `APPROVED`) แล้วสัตว์เป็น `ADOPTED` ทันที คำขออื่นถูกปฏิเสธอัตโนมัติ · ไม่มีขั้นการส่งมอบจริง ไม่มีการติดตาม ไม่มีบทบาทผู้ดูแล

## 2. ขั้นตอนที่เสนอ
`PENDING → ACCEPTED → ARRANGING_HANDOVER → HANDOVER_REPORTED → COMPLETED` · ทางออกอื่น `REJECTED`, `CANCELLED`
- `ACCEPTED` = เจ้าของยอมรับผู้ขอเพื่อนัดหมาย **ไม่ใช่** ได้บ้านแล้ว · สัตว์เป็น `PENDING` (มีผู้ขอ) จนกว่า `COMPLETED`
- `COMPLETED` เมื่อรายงานส่งมอบสองฝ่ายตรงกัน (ส่งมอบแล้ว + วันเดียวกัน) และทั้งคู่ยืนยัน · หรือผู้ดูแลยืนยันผลตรวจเคสข้อพิพาท
- `FOLLOW_UP_REQUIRED` เป็น flag แยก (`flagged`, `escalated`, `disputed`) ไม่ใช่ stage
- รายงานใหม่ล้างการยืนยันเดิม · ห้ามเปลี่ยนสถานะอัตโนมัติจากเวลา

## 3. ฟิลด์ที่ต้องเพิ่ม (ตาราง `adoption_requests` + ตารางใหม่)
| ฟิลด์ | ชนิด | หมายเหตุ |
| --- | --- | --- |
| `stage` | enum ใหม่ | แทน/คู่กับ `status` เดิมระหว่าง migrate |
| `last_activity_at` | timestamptz | อัปเดตเมื่อเปลี่ยน stage เท่านั้น (ไม่ใช่ตอนผู้ดูแลบันทึกการติดต่อ) |
| `flagged`, `escalated`, `disputed`, `verified`, `closed` | boolean | |
| `resolution`, `completed_at`, `closed_at` | text / timestamptz | |
| `handover_reports` | ตารางใหม่: `request_id, party (owner/applicant), handover_date, status, note, evidence_path, created_at` | หนึ่งแถวล่าสุดต่อฝ่าย + ประวัติ |
| `handover_confirmations` | ตารางใหม่: `request_id, party, report_version, confirmed_at` | |
| `case_events` | ตารางใหม่: `request_id, actor_id, actor_role, type, note, created_at` | ไทม์ไลน์ + audit |
| `profiles.role` | enum `member/admin` | ตั้งโดย service role เท่านั้น |
| `profiles.suspended_at` | timestamptz | |

## 4. API ที่เสนอ (ใต้ `/api`)
| Method | Path | ใคร | หมายเหตุ |
| --- | --- | --- | --- |
| POST | `/adoptions/:id/accept` · `/reject` · `/arrange` | เจ้าของ | แทน `PATCH /adoptions/:id` (คงตัวเดิมไว้ช่วงเปลี่ยนผ่าน) |
| POST | `/adoptions/:id/handover-reports` | เจ้าของ/ผู้ขอ | body: date, status, note, evidence |
| POST | `/adoptions/:id/confirm` · `/dispute` | เจ้าของ/ผู้ขอ | |
| DELETE | `/adoptions/:id` | ผู้ขอ | ยกเลิก (เดิมมีแล้ว ขยายให้ใช้ได้ถึง ARRANGING_HANDOVER) |
| GET | `/admin/cases?filter=&stage=&priority=&sort=` | ผู้ดูแล | คิวติดตามคำนวณฝั่ง server |
| POST | `/admin/cases/:id/flag` · `/unflag` · `/escalate` · `/contact` · `/notes` · `/mark-disputed` · `/verify` · `/close` | ผู้ดูแล | `verify` ต้องมี note |
| GET/PATCH | `/admin/pets`, `/admin/pets/:id/review` | ผู้ดูแล | `approve` / `request_changes` + `reason` (บังคับ) · สถานะ review / changes / visible / hidden |
| GET/PATCH | `/admin/users`, `/admin/users/:id/suspend` | ผู้ดูแล | |
| CRUD | `/admin/announcements` | ผู้ดูแล | แทนข้อมูลคงที่ใน `data/promos.ts` |
| GET | `/admin/audit-logs`, `/admin/reports?from=&to=` | ผู้ดูแล | |

## 5. สิทธิ์ (Actor Permissions)
- เจ้าของ: accept/reject/arrange/report/confirm/dispute เฉพาะคำขอของโพสต์ตัวเอง
- ผู้ขอ: cancel/report/confirm/dispute เฉพาะคำขอของตัวเอง
- ผู้ดูแล: ติดตาม บันทึก ส่งต่อ ตรวจ ปิดเคส · **ไม่เลือกผู้รับเลี้ยงแทนเจ้าของ** เว้นแต่มีนโยบายและหลักฐานรองรับ
- ทุกการตรวจสิทธิ์ทำฝั่ง Backend (frontend guard ไม่ใช่ความปลอดภัย)

## 6. นโยบายติดตาม + การแจ้งเตือน
นับจาก `last_activity_at` ขณะ `PENDING`: 24 ชม. แจ้งเจ้าของครั้งแรก · 48 ชม. แจ้งครั้งที่สอง + เข้าคิวผู้ดูแล · 72 ชม. ไม่ตอบกลับ + ส่งต่อเร่งด่วน
ต้องมี job ตามเวลา (Vercel Cron / Supabase scheduled function) + ผู้ส่งอีเมล/SMS จริง (Custom SMTP) · job **ห้าม** อนุมัติ ปฏิเสธ ปิด ลบ หรือเปลี่ยนสัตว์เป็น ADOPTED

## 7. Audit Events
ทุกการเปลี่ยน stage, รายงาน, ยืนยัน, ข้อพิพาท, การกระทำของผู้ดูแล, เปลี่ยน visibility, ระงับบัญชี, แก้ประกาศ → `case_events` / `audit_logs` (actor, role, target, note, เวลา) · append-only

## 8. RLS
- `handover_reports`, `case_events`: อ่านได้เฉพาะเจ้าของโพสต์ ผู้ขอ และผู้ดูแล · เขียนผ่าน Backend (service role) เท่านั้น
- `profiles.role` / `suspended_at`: ผู้ใช้แก้เองไม่ได้
- ผู้เข้าชมทั่วไปห้ามเห็นเบอร์ ข้อความ หรือบันทึกติดตาม

## 9. ความเสี่ยงในการย้ายข้อมูลเดิม
**ห้ามถือว่า `APPROVED` เดิม = `COMPLETED`** — การอนุมัติเดิมอาจหมายถึงแค่การตอบรับ ไม่ใช่หลักฐานว่าส่งมอบจริง
1. เพิ่มคอลัมน์ใหม่โดยไม่ลบ `status` เดิม
2. `PENDING` → `PENDING` · `REJECTED` → `REJECTED`
3. `APPROVED` → `ACCEPTED` + `flagged = true` + event "ย้ายข้อมูล: ต้องยืนยันการส่งมอบ" → เข้าคิวผู้ดูแลให้ติดต่อยืนยัน (manual review)
4. สัตว์ที่ `ADOPTED` จากการอนุมัติเดิม: คงสถานะที่แสดงต่อสาธารณะไว้จนผู้ดูแลตรวจ เพื่อไม่ให้ประกาศที่ได้บ้านแล้วกลับมาเปิดรับเอง
5. ทดสอบ migration กับสำเนาฐานข้อมูลก่อน และเตรียมสคริปต์ย้อนกลับ
