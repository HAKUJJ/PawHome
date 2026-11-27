# Integration Test Report

> **หมายเหตุ (27 พ.ย. 2026):** เอกสารนี้บันทึกสถานะ ณ ตอนเขียน · ปัจจุบันไม่มี `VITE_USE_MOCK`, `VITE_ADMIN_PREVIEW`, `VITE_ADMIN_REAL`, `src/api/mockPets.ts` และ `admin-preview.e2e.mjs` แล้ว — ทั้งเว็บและ `/admin` ใช้ข้อมูลจริงจาก Backend เท่านั้น

รันเมื่อ 27 พ.ย. 2026 บนเครื่อง dev (Windows · Node 22) · ไม่แตะ Supabase / Production · ไม่ commit / push / deploy

## สรุป

| ชุด | คำสั่ง / สภาพแวดล้อม | ผล |
| --- | --- | --- |
| Backend typecheck | `npx tsc --noEmit` | PASS |
| Backend tests | `npm test` (9 ไฟล์ · PGlite) | **242 / 242 PASS** (รันซ้ำ 2 รอบ ~50–64 วินาที) |
| Frontend typecheck | `npx tsc -b` | PASS |
| Frontend tests | `npm test` (6 ไฟล์) | **92 / 92 PASS** |
| Frontend build | `npm run build` | PASS · build ค่าเริ่มต้นไม่มีโค้ด Admin (`ad-sidebar` = 0 ไฟล์) |
| Browser E2E — เว็บสาธารณะ + ผู้ดูแล บนชุดข้อมูลทดสอบ | `scripts/public-workflow.e2e.mjs` (Chromium → Vite → Express → PGlite · Auth ปลอม · workflow เปิด) | **15 / 15 PASS** |
| Browser E2E — Admin Real Mode | `scripts/admin-real.e2e.mjs` (workflow ปิด) | **14 / 14 PASS** |
| Browser E2E — Admin Mock Preview | `scripts/admin-preview.e2e.mjs` (`VITE_USE_MOCK=true`) | **11 / 11 PASS** (รอบแรกบน dev server ที่ยังไม่ compile ล้มที่ขั้นแรกเพราะ timeout 30 วินาที · รอบถัดไปผ่านครบ) |
| Supabase Development (Auth จริง · RLS ด้วย JWT จริง · Storage · concurrency ขนานจริง) | — | **BLOCKED** (ไม่มี credentials) |

> **ความเสถียร:** จากการรัน backend test 4 ครั้ง มี 1 ครั้งค้างเกิน 10 นาที (ไม่มีผลลัพธ์) · ยังไม่ทราบสาเหตุแน่ชัด
> - น่าจะเป็นการเชื่อมต่อ PGlite socket ค้าง (เคยเห็น `P1001 Can't reach database server` ชั่วคราวใน E2E harness ที่ใช้ socket แบบเดียวกัน)
> - รันใหม่ 3 ครั้งผ่านครบในเวลาปกติ
> - ควรตั้ง timeout ใน CI

## Backend (`backend/tests/`)

| ไฟล์ | ครอบคลุม |
| --- | --- |
| `unit.test.ts` | env validation · กฎ `derivePetStatus` (ตอบรับ ≠ ได้บ้าน · legacy) · validators |
| `api.test.ts` | API สาธารณะเดิมทั้งหมด (สัญญาเดิมไม่เปลี่ยน) |
| `database.test.ts` | `verify.sql` · `verify-admin.sql` · migration บนข้อมูลเดิม (APPROVED → ACCEPTED + review) · **expand/contract** (Backend เดิมเขียนได้หลัง 001 · 003 map แล้วบังคับ constraint) · rollback + migrate ซ้ำ |
| `admin.test.ts` | RBAC 401/403 · ยกระดับตัวเองไม่ได้ · ADMIN ตั้ง SUPER_ADMIN ไม่ได้ (+ audit DENIED) · ตรวจโพสต์ · ซ่อน/แสดง · API สาธารณะไม่มีเบอร์ · legacy review · ระงับบัญชี · ประกาศ · dashboard / report · audit append-only |
| `workflow.test.ts` | ทุก transition · สิทธิ์ผู้เกี่ยวข้อง · รายงานใหม่ล้างการยืนยัน · ข้อพิพาท · ผู้ดูแลต้องมีเหตุผล · ยกเลิก · **concurrency** (ตอบรับซ้ำ / ยกเลิกชนตอบรับ / ยืนยันพร้อมกัน) · cron idempotent |
| `notifications.test.ts` | แจ้งเตือนตามเหตุการณ์ · อ่าน 1 / อ่านทั้งหมด · อ่านของคนอื่นไม่ได้ · รายละเอียด/ไทม์ไลน์เฉพาะผู้เกี่ยวข้อง (ไม่เห็นบันทึกผู้ดูแล) · `/config` · ประกาศตั้งเวลา/หมดอายุ · แจ้งเตือนเมื่อเผยแพร่ครั้งเดียว · ประกาศตัวอย่างไม่แจ้ง |
| `bootstrap.test.ts` | แต่งตั้ง SUPER_ADMIN คนแรก: UUID เท่านั้น · ปฏิเสธ demo · ครั้งเดียว · ไม่มี HTTP endpoint |
| `seed.test.ts` | seed 2 รอบไม่เพิ่มแถว · จำนวนตรง manifest · verification 4 ไฟล์ผ่านทุกแถว · cleanup · guard (บัญชีไม่ครบ / ข้อมูลจริง / ลำดับไฟล์) · guard ของ `seed-demo-users` |
| `rate-limit.test.ts` | rate limit เดิม |

## Frontend (`frontend/src/**/*.test.ts`)

| ไฟล์ | ครอบคลุม |
| --- | --- |
| `api/client.test.ts` | session / refresh token / หลายแท็บ (เดิม) |
| `admin/workflow.test.ts` | กฎของ Admin Mock Preview |
| `admin/real.test.ts` | Real Mode: แปลงข้อมูล · ยืนยันสิทธิ์ก่อนโหลด · 401 / 403 / 500 / network error · ยกเลิกสิทธิ์ระหว่างใช้งาน · การกระทำไป endpoint ที่ถูก |
| `types/adoption.test.ts` | ป้ายขั้นตอน · กฎยกเลิก · รายงานตรงกัน · ทนต่อ Backend รุ่นเดิม (404 → ปิดฟีเจอร์ ไม่ error) |

## Browser E2E — เว็บสาธารณะ (`public-workflow.e2e.mjs`)

| ขั้น | ผล |
| --- | --- |
| ฟีดสาธารณะแสดงน้องจากชุดข้อมูล (≥ 100) และไม่มีโพสต์ที่ซ่อน | PASS |
| สมัครสมาชิก → หน้าให้ยืนยันอีเมล | PASS |
| เจ้าของสร้างโพสต์ → แก้ไขโพสต์ | PASS |
| ผู้ขอค้นหา → กดโปรด → ส่งคำขอ | PASS |
| เจ้าของได้แจ้งเตือนคำขอใหม่ → กดแล้วไปหน้าน้อง | PASS |
| เจ้าของตอบรับ (น้องยังไม่ ADOPTED) → เริ่มนัดส่งมอบ | PASS |
| เจ้าของรายงานส่งมอบ | PASS |
| ผู้ขอรายงานวันที่ต่าง → ข้อพิพาท (น้องยังไม่ ADOPTED) | PASS |
| ผู้ขอแก้รายงาน + ยืนยัน · เจ้าของยืนยัน (ยังรอผู้ดูแลเพราะมีข้อพิพาท) | PASS |
| ผู้ดูแลตรวจผลพร้อมเหตุผล → COMPLETED · น้อง ADOPTED | PASS |
| ผู้ขอเห็นรับเลี้ยงสำเร็จ · ไทม์ไลน์ · แจ้งเตือน · อ่านทั้งหมด | PASS |
| ผู้ดูแลเผยแพร่ประกาศ → แสดงบนหน้าแรก | PASS |
| Dashboard / รายงานใช้ข้อมูลชุดทดสอบ (คำขอ ≥ 180) | PASS |
| มือถือ (iPhone 13): หน้าน้อง + แผงส่งมอบ + แจ้งเตือน ไม่ล้นจอ · ผู้ใช้ทั่วไปเข้า admin ไม่ได้ | PASS |
| ไม่มี console / page error ที่ไม่คาดคิด | PASS |

E2E พบปัญหาจริงที่แก้แล้วในรอบนี้:
- **ปุ่มยืนยันถูกซ่อนเมื่อมีข้อพิพาท:** ผู้ดูแลปิดเคสได้เมื่อทั้งสองฝ่ายยืนยันเท่านั้น จึงติดตาย → เปิดให้ยืนยันได้และแจ้งว่าผู้ดูแลจะตรวจก่อน
- **Generator สร้างคำขอหลังน้องได้บ้านแล้ว:** ตรวจเจอด้วยการตรวจกฎใน generator → แก้แล้ว

## Production isolation

| ตรวจ | ผล |
| --- | --- |
| build ค่าเริ่มต้น (และ `VITE_ADMIN_PREVIEW=true`): ไม่มีโค้ด Admin | PASS |
| build `VITE_ADMIN_REAL=true`: มี Admin แต่ไม่มีข้อมูล Mock | PASS (ตรวจในรอบก่อน · ไม่มีการเปลี่ยน store ในรอบนี้) |
| Frontend ใหม่กับ Backend รุ่นเดิม: `/config` `/announcements` `/me/notifications` ตอบ 404 → ปิดฟีเจอร์ ไม่ error | PASS (unit test) |

## วิธีรันซ้ำ

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend && npx tsc -b && npm test && npm run build

# E2E เว็บสาธารณะบนชุดข้อมูลทดสอบ
cd backend && E2E_DEMO_DATASET=1 E2E_HANDOVER_WORKFLOW=1 npx tsx --import ./tests/e2e/loader.mjs tests/e2e/server.ts
cd frontend && VITE_API_URL=http://localhost:3101/api npx vite --port 5182
PAWHOME_PLAYWRIGHT=<path>/playwright/index.mjs node frontend/scripts/public-workflow.e2e.mjs
```

Playwright ไม่อยู่ใน dependencies ของโปรเจกต์ (ติดตั้งแยกแล้วชี้ด้วย `PAWHOME_PLAYWRIGHT`)
