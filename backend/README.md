# PawHome — Backend

Node.js 22 · TypeScript · Express 5 · Prisma 6 · Zod · Supabase (Auth + Storage + PostgreSQL)

## วิธีรัน

```bash
cd backend
npm install                 # รัน prisma generate ให้เอง
cp .env.example .env        # Windows: copy .env.example .env  แล้วใส่ค่าจาก Supabase
npm run dev                 # http://localhost:3000/api/health
```

ต้องรัน `database/schema.sql` ใน Supabase ก่อน (ดู database/README.md) · ภาพรวมระบบ: [README หลัก](../README.md)

| Script | ทำอะไร |
|---|---|
| `npm run dev` | รันแบบ watch (tsx) |
| `npm run build` / `npm start` | compile ไป `dist/` แล้วรันด้วย node |
| `npm test` | unit + ทุก endpoint + session/refresh + rate limit + concurrency + migration/verification SQL + Admin RBAC + ขั้นตอนส่งมอบ บน PostgreSQL จำลอง (PGlite) ไม่ต้องมี credentials · 249 เทสต์ผ่าน (27 พ.ย. 2026) |
| `npm run typecheck` | ตรวจ type ทั้ง src และ tests |
| `npm run seed:users` | สร้างบัญชีทดลอง 3 บัญชีใน Supabase Auth (ก่อนรัน `mock-data.sql`) |
| `npm run admin:bootstrap -- --user <uuid> --confirm-host <host>` | แต่งตั้ง SUPER_ADMIN คนแรก (ครั้งเดียว · ต้องยืนยัน host ของฐานข้อมูล · ไม่มี API แต่งตั้งผู้ดูแล) — ขั้นตอน |
| `scripts/backup-production.ps1` · `scripts/restore-test.ps1` · `scripts/apply-production-sql.ps1` | สำรองฐานข้อมูล · ทดสอบ restore ใน PostgreSQL ชั่วคราว · รัน migration ทีละไฟล์พร้อมตรวจ (ต้องยืนยัน host) — Deployment Checklist |
| `npm run seed:demo-users` | สร้างบัญชีทดสอบ 40 บัญชีของชุดข้อมูล `pawhome-demo-v1` ผ่าน Supabase Admin API · Development เท่านั้น (ต้องตั้ง `SEED_TARGET`, `SEED_ALLOWED_PROJECT_REFS`, `DEMO_USER_PASSWORD`) — คู่มือ |
| `npm run seed:generate` | สร้าง `database/seeds/*.sql` ใหม่จาก `scripts/generate-demo-seed.ts` (deterministic) |
| `npm run smoke:live` | ทดสอบทุก endpoint กับ Supabase จริงผ่าน server ที่รันอยู่ (51 รายการ รวมยกเลิก/อนุมัติพร้อมกัน 5 รอบ) แล้วลบข้อมูลทดสอบ · ไม่สมัครผ่านหน้าสาธารณะ (ไม่ส่งอีเมล) · dev/demo เท่านั้น |

## โครงสร้าง

```
src/
├─ app.ts              express app (cors, json, /api/health, /api/ready, routes, error handler)
├─ server.ts           listen
├─ config/             env (ตรวจด้วย Zod), prisma, supabase (service role + anon client)
├─ routes/index.ts     route สาธารณะ + ผู้ใช้
├─ routes/admin.ts     /api/admin/* (ภาพรวม · สัตว์ · คำขอ · ผู้ใช้ (อ่านอย่างเดียว) · ประกาศ)
├─ middleware/         auth (ตรวจ Supabase token) · admin (RBAC จาก admin_memberships) · error (ApiError → { message }) · upload (multer)
├─ controllers/        แปลง HTTP ↔ service · parse input ด้วย validators
├─ services/           กฎธุรกิจ + ตรวจสิทธิ์เจ้าของ + transaction · adoption-workflow.ts (กฎขั้นตอนแบบฟังก์ชันล้วน) · admin*.service.ts · notifications.service.ts (แจ้งเตือนตามเหตุการณ์) · follow-up.service.ts (เกณฑ์ชั่วโมงของคิวติดตาม)
├─ repositories/       query ผ่าน Prisma + แปลงแถวเป็นรูปแบบที่หน้าเว็บใช้
├─ validators/         Zod schema (กฎเดียวกับฟอร์มในหน้าเว็บ)
└─ types/dto.ts        type ที่ส่งให้หน้าเว็บ (ตรงกับ frontend/src/types)
prisma/schema.prisma   แผนที่ตาราง (โครงสร้างจริงอยู่ที่ database/schema.sql + database/migrations/)
scripts/seed-users.ts  บัญชีทดลอง
tests/                 global-setup (PGlite 2 ก้อน) · fake-supabase · api / database / unit / admin / workflow / notifications / seed tests · e2e/ (server สำหรับ browser E2E)
```

API: ดูตารางใน [README หลัก](../README.md#-api-overview) และโค้ดใน [src/routes/](src/routes/) · งานผู้ดูแล: docs/admin-fullstack-implementation.md

## ตัวแปรของขั้นตอนรับเลี้ยง (มีตัวอย่างใน `.env.example`)

| ตัวแปร | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `ADOPTION_HANDOVER_WORKFLOW` | `false` | `true` = เปิดขั้นตอนส่งมอบ (ตอบรับ → นัด → รายงานสองฝ่าย → ยืนยัน) |
| `FOLLOW_UP_REMINDER_HOURS` / `FOLLOW_UP_ADMIN_HOURS` / `FOLLOW_UP_ESCALATION_HOURS` | `24` / `48` / `72` | ต้องเรียงจากน้อยไปมาก |

ต้องรัน `database/migrations/000`–`003` ก่อน (`GET /api/ready` = 200 เมื่อครบ)

## ความปลอดภัย

- รหัสผ่านอยู่ใน Supabase Auth (bcrypt) Backend ไม่เคยเก็บ
- `SUPABASE_SERVICE_ROLE_KEY` และ `DATABASE_URL` อยู่ใน `.env` ฝั่ง Backend เท่านั้น
- ทุก route ที่แก้ข้อมูลตรวจเจ้าของจาก token ไม่เชื่อ `ownerId`/`userId` ใน body
- รูปตรวจจากไบต์หัวไฟล์ (ไม่เชื่อนามสกุล/Content-Type) · ชื่อไฟล์สุ่ม
- CORS เปิดเฉพาะ `CORS_ORIGIN`
- Rate limit `/auth/login` `/auth/register` `/auth/refresh` ต่อ IP (`RATE_LIMIT_*`) · ไม่เชื่อ `X-Forwarded-For` จนกว่าจะตั้ง `TRUST_PROXY` · นับในหน่วยความจำของ process (Development / Demo)
- สมัครสมาชิกใช้ `signUp` ปกติ (ยืนยันอีเมลตามการตั้งค่าโปรเจกต์) · Admin API ใช้เฉพาะ `seed:users`, logout และสคริปต์ทดสอบ
- `SUPABASE_URL` ต้องเป็น Project URL อย่างเดียว (https หรือ http://localhost) ไม่งั้น server ไม่ยอมเริ่มพร้อมบอกว่าผิดตรงไหน
