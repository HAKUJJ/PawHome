# Database Seed Report — `pawhome-demo-v1`

ทดสอบเมื่อ 27 พ.ย. 2026 บน **PGlite** (PostgreSQL จริงแบบ WASM) ผ่าน `backend/tests/seed.test.ts`
**Supabase Development: BLOCKED** (ไม่มี credentials · project ref เดียวที่ตั้งค่าไว้ในเครื่องเป็นของ Production จึงไม่ได้รันการเขียนใด ๆ บน Supabase)

## ลำดับที่รัน

1. `tests/supabase-stub.sql` (จำลอง `auth.users`, `auth.uid()`, role `anon` / `authenticated`)
2. `database/schema.sql`
3. `migrations/001_admin_workflow.sql` → `002_notifications_announcements.sql` → `003_admin_workflow_contract.sql`
4. บัญชี demo 40 บัญชีใน `auth.users` จำลอง (บน Supabase จริง = `npm run seed:demo-users`)
5. `seeds/001` … `010` (ตาม `manifest.json` → `runOrder`)
6. **รันข้อ 5 ซ้ำอีกรอบ**
7. `verification/verify-demo-data.sql`, `verify-adoption-workflow.sql`, `verify-rls.sql`, `verify-admin.sql`
8. `seeds/999-cleanup-demo.sql` → seed ใหม่ → `verify-adoption-workflow.sql`

## จำนวนแถวที่สร้างจริง (รอบแรก = รอบสอง)

| ตาราง | แถว |
| --- | --- |
| profiles (demo) | 40 |
| admin_memberships | 3 (SUPER_ADMIN 1 · ADMIN 2) |
| user_suspensions | 1 |
| pets | 100 (VISIBLE 95 · HIDDEN 2 · CHANGES_REQUESTED 2 · REVIEW 1) |
| favorites | 150 |
| adoption_requests | 180 (PENDING 108 · ACCEPTED 14 · ARRANGING_HANDOVER 8 · HANDOVER_REPORTED 8 · COMPLETED 12 · REJECTED 24 · CANCELLED 6) |
| — legacy review / disputed / escalated / closed | 4 / 2 / 6 / 4 |
| adoption_stage_history | 393 |
| adoption_handover_reports | 46 |
| adoption_follow_ups | 70 |
| announcements | 12 |
| notification_events | 569 |
| admin_audit_logs (dataset) | 100 |

ตัวเลขทั้งหมดตรวจซ้ำจากฐานข้อมูลโดย `verify-demo-data.sql` (ค่าที่คาดหวังสร้างจาก generator และเทียบกับ `count(*)` จริง)

## ผล Verification

| ไฟล์ | ตรวจอะไร | ผล |
| --- | --- | --- |
| `verify-demo-data.sql` | จำนวนแถวทุกตาราง/สถานะ · orphan ทุก FK · ช่องที่ต้องมีค่า · เบอร์/อีเมลสมมติ · ห้ามขอ/โปรดน้องตัวเอง · แจ้งเตือนเป็นของผู้เกี่ยวข้อง · SUPER_ADMIN หนึ่งคน | PASS ทุกแถว |
| `verify-adoption-workflow.sql` | status = stage · หนึ่งน้องตอบรับได้คำขอเดียว · สถานะน้องตรงกับคำขอ · COMPLETED ต้องยืนยันครบหรือผู้ดูแลตรวจ · รายงาน/ยืนยันตรงกับขั้น · legacy ไม่เคยเป็น COMPLETED เอง · ธงติดตามสอดคล้อง · บันทึกผู้ดูแลไม่รีเซ็ตเวลา · cron แจ้งเตือนเฉพาะ PENDING · ไม่มีแจ้งเตือนซ้ำ · ไทม์ไลน์เริ่มถูก จบที่ stage ปัจจุบัน เวลาไม่ย้อน | PASS ทุกแถว |
| `verify-rls.sql` | RLS เปิดทุกตาราง · policy ครบ · anon / คนนอก / เจ้าของ / ผู้ขอ เห็นและเขียนได้ตามสิทธิ์เท่านั้น | PASS ทุกแถว (role จำลองใน PGlite) |
| `verify-admin.sql` | ตาราง/trigger/constraint ของ migration · append-only · ปลายทางประกาศภายในเว็บ | PASS ทุกแถว |

## Idempotency

| ตรวจ | ผล |
| --- | --- |
| รัน seed รอบสอง → จำนวนแถวทุกตารางเท่าเดิม | PASS |
| Cleanup → ข้อมูลชุดนี้หาย · ข้อมูลอื่นยังอยู่ · audit log ยังอยู่ (append-only) | PASS |
| Seed ใหม่หลัง cleanup → ผลตรวจผ่าน | PASS |

## Guard

| ตรวจ | ผล |
| --- | --- |
| ไม่มีบัญชี demo → หยุดพร้อมบอกให้รัน `seed:demo-users` | PASS |
| มีน้องของผู้ใช้จริง → ทุกไฟล์หยุด ไม่ insert อะไรเลย | PASS |
| รันไฟล์ 004 ก่อน 002 → หยุด (ไม่มีจุดยึดเวลา) | PASS |
| `seed-demo-users.ts`: ไม่ตั้ง SEED_TARGET / project ไม่อยู่ใน allow-list / บน Vercel / รหัสสั้น → หยุด · ไม่แสดงรหัสผ่าน | PASS |

## ยังไม่ได้ทดสอบ

| รายการ | สถานะ |
| --- | --- |
| สร้างบัญชีผ่าน Supabase Auth Admin API จริง | BLOCKED |
| รัน seed / verify บน Supabase Development | BLOCKED |
| RLS ด้วย JWT จริงผ่าน PostgREST | BLOCKED |
| Storage seed | NOT TESTED (ชุดข้อมูลไม่อัปโหลดไฟล์ · ใช้ URL รูปสาธารณะเดิม) |
