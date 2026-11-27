# PawHome Admin — Full-Stack Implementation Report

อัปเดต 27 พ.ย. 2026 · ทดสอบในเครื่อง dev เท่านั้น (ไม่แตะ Supabase / Production · ไม่ commit / push / deploy)

## อัปเดตรอบล่าสุด (เว็บสาธารณะ + แจ้งเตือน + ชุดข้อมูลทดสอบ)

- **Expand/Contract:**
  - constraint `status = stage` ย้ายจาก 001 ไป **003** → Production เดิมทำงานต่อได้ระหว่าง migrate
  - ทดสอบใน `database.test.ts`
- **Migration 002:** แจ้งเตือนตามเหตุการณ์ (อ้างคำขอหรือประกาศ · unique รวมผู้รับ) + ประกาศตั้งเวลา/หมดอายุ
- **เว็บสาธารณะ (`components/HandoverPanel.tsx`):**
  - เจ้าของ: ตอบรับ · เริ่มนัดส่งมอบ · รายงาน · ยืนยัน · แจ้งปัญหา
  - ผู้ขอ: ดูขั้นตอน · ยกเลิก (ตามกฎ) · รายงานว่าได้รับน้อง · ยืนยัน · แจ้งปัญหา
  - ทั้งสองฝ่ายดูไทม์ไลน์ได้
  - แสดงเมื่อ Backend เปิด `ADOPTION_HANDOVER_WORKFLOW` (อ่านจาก `GET /api/config`)
- **แจ้งเตือนในเว็บ:**
  - Backend สร้างใน transaction เดียวกับทุกเหตุการณ์ (และ cron)
  - แท็บ "การแจ้งเตือน" ในหน้า /me · ตัวนับยังไม่อ่านบนเมนูบัญชี · อ่านทีละรายการ/ทั้งหมด · กดแล้วไปหน้าที่เกี่ยวข้อง
  - ไม่ส่งอีเมล/SMS
- **ประกาศหน้าแรก:**
  - `AdStrip` อ่าน `GET /api/announcements` (เฉพาะที่เผยแพร่และอยู่ในช่วงเวลา) · ไม่มีข้อมูล/Backend เดิม → การ์ดเดิมใน `data/promos.ts`
  - เผยแพร่ครั้งแรกแจ้งเตือนผู้ใช้ (ยกเว้นประกาศตัวอย่าง)
- **API ใหม่:**
  - `GET /api/config`
  - `GET /api/adoptions/:id`, `GET /api/adoptions/:id/timeline` (เฉพาะเจ้าของ/ผู้ขอ · ไม่มีบันทึกผู้ดูแล)
  - `PATCH /api/me/notifications/:id/read`, `POST /api/me/notifications/read-all` (`GET /api/me/notifications` คืน `{ unread, items }`)
  - DTO คำขอ (เฉพาะ endpoint ของผู้เกี่ยวข้อง) เพิ่ม `handover`, `disputed`, `legacyReview`, `lastActivityAt`, `completedAt`
- **ชุดข้อมูลทดสอบ `pawhome-demo-v1`:** generator + `database/seeds/*` + verification 3 ไฟล์ + `seed-demo-users.ts`
  - ดู [mock-data-guide.md](mock-data-guide.md) · [database-seed-report.md](database-seed-report.md)
- **ผลทดสอบล่าสุด:**
  - backend 242/242
  - frontend 92/92
  - E2E เว็บสาธารณะ 15/15 · Admin Real 14/14 · Mock 11/11
  - รายละเอียด: [integration-test-report.md](integration-test-report.md)

## สรุปสถานะ

| ส่วน | Implemented | Tested Locally | Requires Supabase Dev Verification | Production Ready |
| --- | --- | --- | --- | --- |
| Migration 001 + rollback + verify | ✅ | ✅ PGlite | ✅ ต้องตรวจ | ❌ |
| RBAC (ADMIN / SUPER_ADMIN) | ✅ | ✅ API + E2E | ✅ (JWT จริง) | ❌ |
| Admin API | ✅ | ✅ | ✅ | ❌ |
| ขั้นตอนส่งมอบ (handover workflow) | ✅ (ปิดไว้เป็นค่าเริ่มต้น) | ✅ | ✅ | ❌ ต้องมีหน้าเว็บสาธารณะก่อน |
| ติดตามเคส + cron | ✅ | ✅ | ✅ (Vercel Cron) | ❌ |
| ประกาศ | ✅ | ✅ | ✅ | ❌ หน้าแรกยังไม่ใช้ API |
| Audit log (append-only) | ✅ | ✅ | ✅ | ❌ |
| Admin UI Real Mode | ✅ | ✅ unit + E2E (Backend จริง + PGlite) | ✅ | ❌ |
| Super Admin bootstrap | ✅ | ✅ | ✅ | ❌ ยังไม่แต่งตั้งใคร |

> **Admin ยังไม่ Production Ready:** ต้องรัน migration และผ่าน Security Tests บน Supabase Development ก่อน

## 1. Files Changed

**Database (track ใน Git แล้ว):**
- `database/migrations/001_admin_workflow.sql` และ `.rollback.sql`
- `database/verification/verify-admin.sql`
- `verify.sql` ปรับให้รองรับคอลัมน์ที่ migration เพิ่ม
- `schema.sql`, `mock-data.sql`, `README.md` กู้คืนจากประวัติ Git (ไม่ได้แก้)

**Backend — ไฟล์ใหม่:**
- `src/routes/admin.ts`, `src/middleware/admin.ts`
- `src/controllers/admin.controller.ts`, `src/controllers/cron.controller.ts`
- `src/services/adoption-workflow.ts`, `admin.service.ts`, `admin-adoptions.service.ts`, `announcements.service.ts`, `follow-up.service.ts`
- `src/repositories/audit.repository.ts`
- `src/types/admin.ts`, `src/validators/admin.validator.ts`
- `scripts/grant-super-admin.ts`

**Backend — ไฟล์ที่แก้:**
- `prisma/schema.prisma`, `src/config/env.ts`, `src/routes/index.ts`
- `src/middleware/auth.ts` (บัญชีถูกระงับ + optional auth)
- `services` / `repositories` / `validators` ของ adoptions และ pets
- `src/types/dto.ts` (เพิ่มฟิลด์แบบ additive)
- `package.json` (`admin:bootstrap`), `.env.example`

**Backend — Tests:**
- ใหม่: `admin.test.ts`, `workflow.test.ts`, `bootstrap.test.ts`, `tests/e2e/*` (harness สำหรับ browser E2E)
- แก้: `database.test.ts`, `unit.test.ts`, `global-setup.ts`, `fake-supabase.ts`

**Frontend:**
- ใหม่:
  - `src/admin/api.ts` (client + แปลงข้อมูล)
  - `src/admin/real.ts` (Real provider)
  - `src/admin/real.test.ts`
  - `scripts/admin-real.e2e.mjs`
- แก้:
  - `src/router.tsx`, `src/admin/store.ts`, `workflow.ts`
  - `AdminPreview.tsx` (gate)
  - `Pets.tsx`, `Adoptions.tsx`, `People.tsx`, `Content.tsx`, `Settings.tsx`, `Dashboard.tsx`, `Reports.tsx`, `admin.css`
  - `.env.example`

**Docs:**
- `admin-architecture.md`
- `admin-fullstack-implementation.md` (ไฟล์นี้)
- `admin-migration-plan.md`
- `admin-deployment-checklist.md`
- `admin-super-admin-bootstrap.md`
- แก้ README ทั้ง 3 ไฟล์

## 2. Admin Backend APIs (`/api/admin/*`)

ทุก route ผ่าน `requireAuth` (token Supabase) → `requireAdmin` (`admin_memberships`) → `requirePermission`

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/me` | (ผู้ดูแลทุกคน) |
| GET | `/dashboard` | `dashboard.read` |
| GET | `/pets`, `/pets/:id` | `pets.read` |
| PATCH | `/pets/:id` (ซ่อน/แสดง) · POST `/pets/:id/moderation` (APPROVE / REQUEST_CHANGES + reason) | `pets.moderate` |
| GET | `/adoptions` (`q`, `stage`, `priority`, `queue`, `sort`, `page`, `limit`), `/adoptions/:id`, `/adoptions/:id/timeline` | `adoptions.read` |
| POST | `/adoptions/:id/follow-ups` (FLAG / UNFLAG / CONTACT / NOTE / RESOLVE), `/adoptions/:id/escalate` | `adoptions.follow_up` |
| POST | `/adoptions/:id/review-handover` (COMPLETE / VERIFY / MARK_DISPUTED / REOPEN + note บังคับ), `/adoptions/:id/close` | `adoptions.resolve` |
| GET | `/users`, `/users/:id` | `users.read` |
| POST / DELETE | `/users/:id/suspension` | `users.suspend` |
| GET · PUT · DELETE | `/admins`, `/admins/:userId` | `admins.manage` (SUPER_ADMIN เท่านั้น) |
| GET · POST · PATCH · DELETE | `/announcements`, `/announcements/:id` | `announcements.manage` |
| GET | `/reports?from&to` | `reports.read` |
| GET | `/audit-logs` (`action`, `targetType`, `targetId`) | `audit.read` |

API สาธารณะที่เพิ่ม:
- `GET /announcements`
- `GET /me/notifications`
- `POST /adoptions/:id/arrange` · `/handover-reports` · `/confirm` · `/dispute` (ใช้ได้เมื่อ `ADOPTION_HANDOVER_WORKFLOW=true`)
- `GET /internal/cron/follow-ups` (ต้องมี `CRON_SECRET`)

**Compatibility:**
- API เดิมคืนรูปแบบเดิมและเพิ่มเฉพาะฟิลด์ใหม่ (`stage`, `visibility`, `moderationReason`)
- `PATCH /adoptions/:id` ยังใช้ได้
- `GET /pets/:id` รับ token แบบ optional (เจ้าของเห็นโพสต์ที่ถูกซ่อนของตัวเอง)

## 3. Database Migration

ดู [admin-migration-plan.md](admin-migration-plan.md)
- APPROVED เดิมไม่ถูกแปลงเป็น COMPLETED
- ทดสอบบน PGlite ครบ (idempotent, backfill, rollback)
- Supabase Development = BLOCKED

## 4. RBAC Implementation

- **ที่มาของ role:** ตาราง `admin_memberships` อ่านทุก request · ไม่มีแถว = USER
  - ไม่เชื่อ role จาก header / body / localStorage
  - ไม่ใช้อีเมลตายตัว
- **สิทธิ์:** ADMIN มีทุกสิทธิ์ยกเว้น `admins.manage`
  - เกินสิทธิ์ → 403 + audit `permission.denied` (result `DENIED`)
- **SUPER_ADMIN:**
  - แต่งตั้ง / ถอดสิทธิ์คนอื่นได้ แต่แก้ของตัวเองไม่ได้
  - แต่งตั้งบัญชีที่ถูกระงับไม่ได้
- **ระงับบัญชี:**
  - `requireAuth` ตอบ 403 ทุก endpoint
  - ระงับผู้ดูแลหรือตัวเองไม่ได้
- **ชั้นฐานข้อมูล:** RLS + สิทธิ์รายคอลัมน์กันผู้ใช้แต่งตั้งตัวเอง / ปลดระงับตัวเอง / เขียน stage หรือ visibility ผ่าน PostgREST
- **Backend ใช้ role `postgres` (Prisma)** ซึ่งข้าม RLS: ทุก service จึงตรวจสิทธิ์และความเป็นเจ้าของเองก่อน query/mutation

## 5. Adoption Workflow

```
PENDING → ACCEPTED → ARRANGING_HANDOVER → HANDOVER_REPORTED → COMPLETED
             ↘ REJECTED / CANCELLED
```

- **กฎ:** อยู่ใน `services/adoption-workflow.ts` (ฟังก์ชันล้วน)
- **การเปลี่ยนขั้น:** `updateMany` แบบมีเงื่อนไขขั้นเดิม (atomic) ใน transaction เดียวกับการซิงก์สถานะน้อง
- **กันการแข่งกัน:**
  - ตอบรับซ้ำ: unique index ต่อน้อง → 409
  - ยกเลิกชนกับตอบรับ: เงื่อนไขขั้นเดิม
  - ยืนยันซ้ำ: เงื่อนไข `*_confirmed_at is null`
  - ยืนยันรายงานเก่า: `handover_version`
- **`derivePetStatus`:** `COMPLETED` หรือ `legacy_review` → ADOPTED · ขั้นที่ยังไม่จบ → PENDING · นอกนั้น → AVAILABLE
- **โหมดเดิม (ค่าเริ่มต้น):** อนุมัติ → `ACCEPTED + legacy_review` · น้อง ADOPTED เหมือนเดิม · คำขออื่นถูกปฏิเสธ · เข้าคิวผู้ดูแล

## 6. Handover Confirmation

- เจ้าของ / ผู้ขอรายงาน (วันที่ + ผล + note + รูปหลักฐานที่ตัวเองอัปโหลดเท่านั้น)
- รายงานใหม่ล้างการยืนยันเดิมของทั้งสองฝ่าย
- รายงานขัดกัน → `disputed` + เข้าคิว (urgent) · ยืนยันครบก็ยังไม่สำเร็จจนผู้ดูแลตรวจ
- ผู้ดูแลปิดเป็นสำเร็จได้เมื่อรายงานตรงกันและยืนยันครบ (หรือเป็นข้อมูลระบบเดิม) · **ต้องมีเหตุผลทุกครั้ง**
- รายงานฝ่ายเดียวไม่ทำให้น้องเป็น ADOPTED
- ไทม์ไลน์รวมการเปลี่ยนขั้น, รายงาน และบันทึกผู้ดูแล

## 7. Follow-up System

- **ความเร่งด่วน:** คำนวณสดจาก `last_activity_at` (เปลี่ยนเฉพาะเมื่อเปลี่ยนขั้น)
  - บันทึกการติดต่อหรือโน้ตของผู้ดูแลไม่รีเซ็ตเวลาเงียบ
- **เกณฑ์:** `FOLLOW_UP_*_HOURS` (ค่าเริ่มต้น 24 / 48 / 72)
- **Cron:** สร้าง `notification_events` แบบ idempotent (unique `request_id, kind, activity_at`)
  - ไม่ auto approve / reject / complete / delete
  - ไม่ส่งอีเมลหรือ SMS
- **ผู้ดูแลทำได้:** ตั้ง/เอาธง · บันทึกการติดต่อ · โน้ต · ส่งต่อ · ติดตามเสร็จ (ข้อพิพาท/legacy ต้องจบด้วย review-handover)
- **ข้อจำกัด:** Vercel Hobby รัน cron วันละครั้ง (ดู checklist ข้อ 5) · หน้าแจ้งเตือนในเว็บสาธารณะยังไม่มี (มีแค่ API)

## 8. Frontend Integration

| โหมด | เงื่อนไข | ข้อมูล |
| --- | --- | --- |
| ไม่มี Admin | ค่าเริ่มต้น | production build ไม่มีโค้ด Admin |
| ข้อมูลจริง (โหมดเดียว) | `/admin` มีใน build เสมอ | `/api/admin/*` เท่านั้น · store เริ่มว่าง · ไม่มี fallback |

- **Gate:** ยังไม่ผ่าน `GET /admin/me` → ไม่แสดง layout หรือข้อมูลใด ๆ
  - หน้าจอแยก: กำลังตรวจสอบ / เข้าสู่ระบบ (401) / ไม่มีสิทธิ์ (403 รวมบัญชีถูกระงับ) / เชื่อมต่อไม่สำเร็จ + ลองใหม่
- **Session:** ใช้ `api/client.ts` เดิม (refresh อัตโนมัติ, 401 → logout)
  - เปลี่ยน token / logout / แท็บอื่นออกจากระบบ → ตรวจสิทธิ์ใหม่ทันที
- **การเปลี่ยนข้อมูล:** เรียก API → แจ้งผล → โหลดใหม่จาก Backend (ไม่มี optimistic update) · error แสดงเป็น toast สีแดง
- **หน้าจอเดิมทั้งหมด** · Real Mode ซ่อนปุ่มที่ไม่มีใน Backend (ลบโพสต์, รีเซ็ตข้อมูลจำลอง, เลื่อนเวลา)
  - เพิ่มปุ่ม "ยืนยันว่าส่งมอบแล้ว / ยังไม่ได้ส่งมอบ" สำหรับคำขอระบบเดิม
  - เพิ่มช่องเหตุผลตอนระงับบัญชี (Backend บังคับ)
- **Audit Logs:** หน้า "ประวัติกิจกรรม" ถูกเอาออกตามคำขอก่อนหน้า · ข้อมูล audit จริงแสดงในการ์ด "กิจกรรมผู้ใช้ล่าสุด" บนหน้าภาพรวม · API `GET /api/admin/audit-logs` พร้อมใช้

## 9. Security Tests (`backend/tests/admin.test.ts`, `workflow.test.ts`, `bootstrap.test.ts`, `verify-admin.sql`)

| # | Test | ผล |
| --- | --- | --- |
| 1 | Anonymous เข้า Admin API ไม่ได้ (401) | PASS |
| 2 | USER เข้า Admin ไม่ได้ (403 แม้ส่ง header ปลอม) | PASS |
| 3 | USER ยกระดับ role ตัวเองไม่ได้ (API 403 + RLS blocked) | PASS |
| 4 | ADMIN แต่งตั้ง SUPER_ADMIN ไม่ได้ + audit DENIED | PASS |
| 5 | Token ไม่ถูกต้อง / ไม่ใช่ Bearer → 401 | PASS |
| 6 | ตรวจโพสต์โดยไม่มีสิทธิ์ → 403 | PASS |
| 7 | คนนอกรายงาน / ยืนยัน / แจ้งข้อพิพาทการส่งมอบไม่ได้ (403) | PASS |
| 8 | Concurrent: ตอบรับซ้ำ / ยกเลิกชนตอบรับ / ยืนยันพร้อมกัน | PASS (PGlite — คิวเดียว) · BLOCKED (ขนานจริงบน Supabase) |
| 9 | Audit log: ไม่มี endpoint แก้/ลบ · trigger กัน update/delete/truncate · ไม่มี token/password ใน log | PASS |
| 10 | RLS ปฏิเสธการเขียนที่ไม่ได้รับอนุญาต | PASS (PGlite + role จำลอง) · BLOCKED (Supabase Auth จริง) |
| 11 | API สาธารณะไม่เปิดเผยเบอร์โทร / ข้อความ · โพสต์ที่ซ่อนไม่แสดง | PASS |
| 12 | Frontend ข้ามสิทธิ์ Backend ไม่ได้ (E2E: USER เห็นหน้าไม่มีสิทธิ์ · API 403) | PASS |
| — | Bootstrap: ต้องระบุ UUID / ปฏิเสธ demo / ครั้งเดียว / ไม่มี HTTP endpoint | PASS |

## 10. Regression + Test Results (รันล่าสุด 27 พ.ย. 2026)

| ชุด | ผล |
| --- | --- |
| backend `npx tsc --noEmit` | PASS |
| backend `npm test` (7 ไฟล์) | **217 / 217 PASS** (API เดิม 140 เทสต์ยังผ่านทั้งหมด) |
| frontend `npx tsc -b` | PASS |
| frontend `npm test` (5 ไฟล์) | **79 / 79 PASS** |
| frontend `npm run build` | PASS |
| Production build | PASS: มีโค้ด Admin แต่ไม่มีข้อมูลจำลอง (grep ชื่อ mock = 0) |
| Browser E2E Real Mode (`admin-real.e2e.mjs`: Chromium → Vite → Express จริง → PGlite, Auth ปลอม) | **14 / 14 PASS** |
| `npm run smoke:live` (Supabase จริง) | NOT TESTED (ห้ามแตะ Supabase ในรอบนี้) |

Real Mode E2E ครอบคลุม:
- login gate / forbidden
- dashboard ข้อมูลจริง
- ตัดสินคำขอระบบเดิม
- บันทึกการติดต่อ (ไม่รีเซ็ตเวลา)
- ซ่อนโพสต์ → หายจาก API สาธารณะ
- ระงับบัญชี → API 403
- สร้าง / เผยแพร่ประกาศ
- audit บนหน้าภาพรวม
- token ไม่ถูกต้อง → refresh อัตโนมัติ
- network error + ลองใหม่
- logout จากแท็บอื่น
- ไม่มี console error

E2E พบ bug จริง 1 จุด และแก้แล้ว: หน้าภาพรวมพังเมื่อเคสยังไม่ได้โหลดไทม์ไลน์ (Real Mode โหลดไทม์ไลน์ทีละเคส)

## 11. Remaining Blockers

| ประเด็น | สถานะ | ต้องทำ |
| --- | --- | --- |
| Supabase Development credentials | BLOCKED | รัน migration + verify + ทดสอบ RLS กับ JWT จริง + concurrency ขนานจริง |
| หน้าเว็บสาธารณะสำหรับรายงาน/ยืนยันส่งมอบ | NOT STARTED | ต้องมีก่อนเปิด `ADOPTION_HANDOVER_WORKFLOW=true` |
| หน้าแรกอ่านประกาศจาก API | NOT STARTED | ตอนนี้ใช้ `data/promos.ts` (URL 3 กิจกรรมเดิมไม่เปลี่ยน) |
| แจ้งเตือนในเว็บ / อีเมล | NOT STARTED | มี `notification_events` + `GET /api/me/notifications` แล้ว · ส่งอีเมลต้องมี Custom SMTP และการอนุญาต |
| `backend/vercel.json` cron | NOT CREATED | สร้างตอน deploy (checklist ข้อ 5) |
| Deploy ลำดับ migration → backend | ต้องวางแผน | backend เก่าชน constraint ใหม่ |
| Playwright ไม่อยู่ใน dependencies | ตั้งใจ | E2E ชี้ path ด้วย `PAWHOME_PLAYWRIGHT` |

## 12. Production Readiness

**NOT READY** — ต้องผ่านเงื่อนไขทั้งหมดใน [admin-deployment-checklist.md](admin-deployment-checklist.md) ก่อน:
- รัน migration และ security tests บน Supabase Development
- แต่งตั้ง SUPER_ADMIN จริง (ต้องได้รับอนุมัติ)
- Deploy ตามลำดับ

## วิธีรันซ้ำ

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend && npx tsc -b && npm test && npm run build

# Browser E2E — Real Mode (ไม่ต้องมี credentials)
cd backend && npx tsx --import ./tests/e2e/loader.mjs tests/e2e/server.ts
cd frontend && VITE_API_URL=http://localhost:3101/api npx vite --port 5182
PAWHOME_PLAYWRIGHT=<path>/playwright/index.mjs node frontend/scripts/admin-real.e2e.mjs

# Browser E2E — Mock Preview
```
