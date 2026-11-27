# Admin Deployment Checklist

**สถานะรวม: NOT PRODUCTION READY**

Preflight บน Production ผ่านแล้ว (27 พ.ย. 2026 · อ่านอย่างเดียว · blocker 9/9) · ยังไม่ได้รัน migration ใด ๆ บน Production และยังไม่มี Supabase Development

**Production ปัจจุบัน (ตรวจจาก Vercel API 27 พ.ย. 2026):** ทั้ง `paw-home-backend` (root `backend`, framework express) และ `paw-home` (root `frontend`, vite) = commit `388437f` บน `main` · deploy 23 พ.ย. · Ready · build command ค่าเริ่มต้น (`prisma generate && tsc` — ไม่มี migrate) · `/api/health` ตอบรูปแบบเดิม · `/api/ready` = 404

ใช้ Vercel Projects เดิม: frontend `paw-home` · backend `paw-home-backend` (ห้ามสร้าง Project ใหม่)

## 0. ก่อนเริ่ม

- [ ] สำรองฐานข้อมูล Production (Supabase → Database → Backups)
- [ ] มี Supabase **Development** project แยกจาก Production
- [ ] `npm test` ผ่านทั้ง `backend` และ `frontend` · `npm run build` ผ่านทั้งสองฝั่ง
- [ ] อ่าน [admin-migration-plan.md](admin-migration-plan.md) แล้ว

## 1. Supabase Development

- [ ] รัน `database/schema.sql` → `migrations/001` → `002` → (deploy Backend ใหม่ไป Preview) → `003`
- [ ] `npm run seed:users` แล้วรัน `database/mock-data.sql`, `verify.sql`, `verify-admin.sql` (ทุกแถว `ok = true`)
- [ ] (ชุดข้อมูลทดสอบสมจริง) `npm run seed:demo-users` (ต้องตั้ง `SEED_TARGET`, `SEED_ALLOWED_PROJECT_REFS`, `DEMO_USER_PASSWORD`) → `database/seeds/001…010` → `verify-demo-data.sql`, `verify-adoption-workflow.sql`, `verify-rls.sql` — ดู [mock-data-guide.md](mock-data-guide.md) · **ห้ามรันบน Production** (มี guard แต่ห้ามพึ่ง guard อย่างเดียว)
- [ ] ทดสอบ RLS ด้วย anon key จริงผ่าน PostgREST:
  - ผู้ใช้แก้ `stage` / `visibility` / `admin_memberships` / `user_suspensions` ไม่ได้
  - อ่าน `admin_audit_logs` และ `adoption_follow_ups` ไม่ได้
- [ ] แต่งตั้ง SUPER_ADMIN ทดสอบด้วย [admin-super-admin-bootstrap.md](admin-super-admin-bootstrap.md) (บัญชีทดสอบ ไม่ใช่บัญชีจริง)
- [ ] Deploy backend ไป Vercel **Preview** ที่ชี้ Supabase Development แล้วทดสอบข้อ 4 ทั้งหมด

## 2. Environment Variables

**Backend (`paw-home-backend`):** (Vercel ตอนนี้มี: APP_URL, CORS_ORIGIN, DATABASE_URL, RATE_LIMIT_*×3, STORAGE_BUCKET, SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY, TRUST_PROXY · ตัวใหม่ด้านล่างทั้งหมดมีค่าเริ่มต้นหรือไม่บังคับ → deploy ได้โดยไม่ต้องเพิ่ม · ต้องเพิ่ม `CRON_SECRET` ถ้าจะเปิด cron)

| ตัวแปร | ค่าแนะนำ | หมายเหตุ |
| --- | --- | --- |
| `ADOPTION_HANDOVER_WORKFLOW` | `false` | เปิด `true` เมื่อหน้าเว็บสาธารณะมีปุ่มรายงาน/ยืนยันส่งมอบแล้วเท่านั้น |
| `FOLLOW_UP_REMINDER_HOURS` / `_ADMIN_` / `_ESCALATION_` | `24` / `48` / `72` | ต้องเรียงจากน้อยไปมาก ไม่งั้น server ไม่เริ่ม |
| `CRON_SECRET` | สุ่ม ≥ 32 ตัวอักษร 🔒 | ไม่ตั้ง = endpoint cron ตอบ 503 |
| `DATABASE_URL` | Transaction pooler + `?pgbouncer=true&connection_limit=1` | เดิม |
| `TRUST_PROXY` | `1` | เดิม |

**Frontend (`paw-home`):** (Vercel มี `VITE_USE_MOCK` ค้างอยู่ — ไม่มีผลแล้ว ลบได้ 🔒 · `VITE_API_URL` ตั้งเฉพาะ production ไม่มี preview)

| ตัวแปร | ค่า | หมายเหตุ |
| --- | --- | --- |
| `VITE_API_URL` | `https://<api-domain>/api` | route `/admin` มีใน build เสมอ แต่แสดงข้อมูลหลัง Backend ยืนยันสิทธิ์ (`GET /api/admin/me`) เท่านั้น |

ตัวแปร `VITE_*` ถูกฝังตอน build → เปลี่ยนแล้วต้อง Redeploy

## 3. Production (ต้องได้รับอนุมัติก่อนทุกขั้นที่มี 🔒)

Expand → Contract: ระหว่าง 001/002 กับการ deploy Backend ใหม่ Backend เดิมยังทำงานได้ (ไม่มี downtime) · constraint บังคับใน 003 หลัง Backend ใหม่ทำงานแล้ว

### 3.1 ความเข้ากันได้ (ทดสอบแล้วใน `backend/tests/database.test.ts`)

| Backend | Schema | ผล |
| --- | --- | --- |
| เดิม (ที่ Production ใช้อยู่) | เดิม | ✅ สถานะปัจจุบัน |
| เดิม | Expanded (001 + 002) | ✅ สร้าง/อนุมัติ/ปฏิเสธ/ยกเลิก/ลบโพสต์ได้ตามเดิม · stage ของแถวที่เขียนช่วงนี้ยังเป็น PENDING จน 003 map ให้ |
| ใหม่ | Expanded (001 + 002) | ✅ ทำงานครบ · `/api/health` = 200 (`schema: "pending"`) · `/api/ready` = 503 `missing: ["003"]` |
| ใหม่ | Contracted (001–003) | ✅ เป้าหมาย · `/api/ready` = 200 |
| ใหม่ | เดิม (ยังไม่รัน 001) | ❌ ห้าม · endpoint ที่ใช้ stage/visibility ล้ม · `/api/ready` = 503 `missing: ["001","002","003"]` |
| เดิม | Contracted | ❌ อนุมัติ/ปฏิเสธไม่ได้ (constraint) → rollback 003 ก่อน rollback Backend เสมอ |

Legacy mapping: `APPROVED` เดิม → `ACCEPTED` + `legacy_review` (ผู้ดูแลต้องยืนยันพร้อมเหตุผล) · **ไม่มีแถวใดกลายเป็น `COMPLETED`** · น้องที่ `ADOPTED` คงสถานะเดิม

### 3.2 Preflight (อ่านอย่างเดียว · รันได้โดยไม่ต้องอนุมัติ)

- [ ] รัน [`database/verification/preflight-production.sql`](../database/verification/preflight-production.sql) ในธุรกรรม read-only → แถว `blocker` ต้อง `ok = true` ทั้งหมด
- [ ] จดตัวเลขแถว `info` (จำนวนคำขอ/น้อง/ผู้ใช้/รูป) ไว้เทียบหลัง migrate

### 3.2.1 Security hotfix (ทำได้ทันทีหลังอนุมัติ · อิสระจาก 001–003) 🔒

`_prisma_migrations` บน Production: RLS ปิด · ไม่มี policy · anon/authenticated มี SELECT INSERT UPDATE DELETE TRUNCATE · ยืนยันแล้วว่า `GET /rest/v1/_prisma_migrations` ด้วย anon key ได้ 200

- [x] รัน `database/migrations/000_lock_prisma_migrations.sql` (revoke + enable RLS · ไม่แตะแถว · ตรวจตัวเองในธุรกรรม) — **ทำแล้วบน Production 27 พ.ย. 2026 (ผู้ใช้อนุมัติ Gate B)**
- [x] privileges ของ anon/authenticated = 0 · RLS เปิด · PostgREST anon อ่าน/ลบ = 401 · ประวัติ migration ตรงกับก่อนรันทุกคอลัมน์ · postgres ยังอ่านได้ · `/api/health` และ `/api/pets` ของ Backend เดิม = 200

### 3.3 Backup 🔒

- [ ] Supabase → Database → Backups: ยืนยันว่ามี backup ล่าสุด (Free plan ไม่มี PITR → ทำ logical dump เองด้วย)
- [ ] `powershell -File backend/scripts/backup-production.ps1 -ConfirmHost db.<ref>.supabase.co`
  - pg_dump 17.11 (`C:\Program Files\PostgreSQL\17\bin`) = เวอร์ชันเดียวกับ server 17.11 · Direct connection (IPv6 เท่านั้น — เครื่องนี้ต่อได้)
  - schema `public` + `storage` · custom format · ไม่ส่งรหัสผ่านทาง command line · ไม่พิมพ์รหัสผ่าน
  - เก็บที่ `%USERPROFILE%\PawHome-backups\` (สคริปต์ปฏิเสธโฟลเดอร์ใน repo · `*.dump` อยู่ใน .gitignore แล้ว) + `.sha256` + `.list`
- [ ] ตรวจ: `.list` มี `TABLE DATA public` ของ profiles / pets / favorites / adoption_requests / _prisma_migrations
- [ ] ทดสอบ restore (ไม่แตะ Production · ไม่ต้องใช้ Docker): `powershell -File backend/scripts/restore-test.ps1 -DumpFile <file>.dump -Expect "public.profiles=10,public.pets=46,public.favorites=19,public.adoption_requests=12,public._prisma_migrations=1,storage.objects=7"` (ตัวเลขจาก preflight ล่าสุด)
  - สร้าง PostgreSQL 17 ชั่วคราวด้วย initdb ใน %TEMP% (localhost เท่านั้น) → restore ทีละ section → นับแถว · ตรวจ FK / ความสอดคล้องคำขอ-น้อง / RLS → ปิดและลบโฟลเดอร์เสมอ
  - ผ่าน = `RESTORE TEST: PASS` (exit 0) · error ใน pre/post-data ที่เป็น role/extension เฉพาะ Supabase ยอมรับได้ · error ใน data = FAIL
  - **ไม่ผ่าน = ห้ามทำ migration ต่อ**
- [ ] Export ตาราง `auth.users` ไม่จำเป็น (migration ไม่แตะ schema auth) · รูปใน Storage ไม่ถูกแตะ

### 3.3.1 ผล Gate A (27 พ.ย. 2026 · ผู้ใช้อนุมัติ)

- Backup: `%USERPROFILE%\PawHome-backups\20261127-173139-public-storage.dump` (162 KB) + `.sha256` + `.list` · โฟลเดอร์จำกัดสิทธิ์เฉพาะผู้ใช้ Windows ปัจจุบัน (ไม่สืบทอดสิทธิ์)
- Restore test: PASS · profiles 10 · pets 46 · favorites 19 · adoption_requests 12 · _prisma_migrations 1 · storage.objects 7 · FK / ความสอดคล้องคำขอ-น้อง / RLS ผ่าน · cluster ชั่วคราวถูกลบแล้ว
- ซ้อม 001 → 002 → verify → 003 → verify → verify-adoption-workflow บนสำเนาจาก backup นี้: PASS ทุกแถว · ใช้เวลารวม ~0.5 วินาที · legacy 4 รายการ → ACCEPTED + legacy_review · COMPLETED = 0

### 3.4 ลำดับ deploy

รัน SQL ทีละไฟล์ด้วย `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f <file>` หรือ SQL Editor (ทุกไฟล์อยู่ใน `begin … commit` เดียว: ล้ม = ไม่มีผลเลย)

0. [x] `migrations/000_lock_prisma_migrations.sql` (ทำแล้ว 27 พ.ย. 2026)
1. [ ] 🔒 `migrations/001_admin_workflow.sql` → ตรวจ `verification/verify-admin.sql` (ทุกแถว `ok = true`)
2. [ ] 🔒 `migrations/002_notifications_announcements.sql`
3. [ ] ตรวจ Backend เดิมยังทำงาน: เปิดหน้าแรก · ดูรายละเอียดน้อง · ล็อกอิน
4. [ ] 🔒 Deploy backend ใหม่ (`ADOPTION_HANDOVER_WORKFLOW=false`, `CRON_SECRET`) → `/api/health` = 200 · `/api/ready` = 503 `missing: ["003"]` (ปกติ)
5. [ ] 🔒 `migrations/003_admin_workflow_contract.sql` → `verification/verify-adoption-workflow.sql` → `/api/ready` = 200
6. [ ] ตรวจ flow สาธารณะ: ล็อกอิน · ดูน้อง · ขอรับเลี้ยง · เจ้าของตอบรับ · รีเฟรชแล้วข้อมูลยังอยู่ · อัปโหลด/เปลี่ยนรูป
7. [ ] 🔒 Redeploy frontend (ไม่มี flag ให้เปิด · `/admin` แสดงข้อมูลหลัง Backend ยืนยันสิทธิ์เท่านั้น)
8. [ ] 🔒 แต่งตั้ง SUPER_ADMIN คนแรก ([admin-super-admin-bootstrap.md](admin-super-admin-bootstrap.md)) — บัญชีที่เจ้าของโปรเจกต์ยืนยันแล้ว
9. [ ] เปิด `/admin` → เห็นคำขอ legacy review ในคิว (จำนวนเท่ากับ APPROVED ใน preflight) → ตัดสินทีละรายการพร้อมเหตุผล
10. [ ] (ภายหลัง) 🔒 `ADOPTION_HANDOVER_WORKFLOW=true` เมื่อพร้อมให้ผู้ใช้รายงาน/ยืนยันการส่งมอบผ่านหน้าเว็บ

### 3.4.1 Gate C — รัน 001 + 002 (เตรียมพร้อมแล้ว รออนุมัติ)

1. Preflight ใหม่ (อ่านอย่างเดียว) → จดตัวเลข `approved / requests / pets / profiles / favorites`
2. Backup ใหม่ทันทีก่อนรัน (ข้อมูลอาจเปลี่ยนหลัง Gate A) + `restore-test.ps1` → ต้อง PASS
3. รัน (หยุดเองที่ไฟล์แรกที่ผิด · verify ไม่ผ่าน = ไม่รันไฟล์ถัดไป):
   ```powershell
   powershell -File backend/scripts/apply-production-sql.ps1 -ConfirmHost db.<ref>.supabase.co -Files database/migrations/001_admin_workflow.sql,database/migrations/002_notifications_announcements.sql,database/verification/verify-production-migration.sql -PsqlVars "approved=<n>,requests=<n>,pets=<n>,profiles=<n>,favorites=<n>"
   ```
4. ตรวจ Backend เดิมยังทำงาน: `/api/health` = 200 · `/api/pets` และ `/api/pets/:id` = 200 · PostgREST anon อ่าน `admin_audit_logs` / `admin_memberships` ไม่ได้
5. ไม่ผ่านข้อใด → หยุด · ย้อนด้วย `002_…rollback.sql` แล้ว `001_…rollback.sql` (ยังไม่มีข้อมูลใหม่ในตารางใหม่ จึงไม่เสียข้อมูล)

### 3.4.2 แผน deploy แยก Backend / Frontend

ทั้งสอง Vercel project build จาก `main` ทุกครั้งที่ push → แยกด้วย **ลำดับ commit**: push ชุดที่ไม่มีไฟล์ใน `frontend/` ก่อน (Frontend build ซ้ำจากโค้ดเดิมทุกไบต์ = ไม่เปลี่ยน) แล้วค่อย push ชุด frontend

| Commit | ไฟล์ | push รอบ |
| --- | --- | --- |
| 1 `fix(db): lock _prisma_migrations from PostgREST` | `database/migrations/000_*` | D |
| 2 `feat(db): admin workflow migrations 001–003 + verification` | `database/migrations/001–003*`, `database/verification/`, `database/schema.sql`, `database/README.md` | D |
| 3 `feat(db): demo seed datasets (dev/test only)` | `database/seeds/`, `database/mock-data.sql` | D |
| 4 `feat(backend): admin API, handover workflow, notifications, health/ready, storage cleanup` | `backend/` (ไม่มี `.env`) | D |
| 5 `docs: production rollout runbook` | `docs/`, `README.md`, `.gitignore`, `.claude/skills/` | D |
| 6 `feat(frontend): real-data admin, handover panel, notifications; remove mock mode` | `frontend/` (ไม่มี `.env`) | F |

- **Gate D (หลัง C ผ่าน):** commit 1–5 → push `main` → `paw-home-backend` deploy โค้ดใหม่ · `paw-home` build `frontend/` เดิม
  - ตรวจ: `/api/health` = 200 `schema: "pending"` · `/api/ready` = 503 `missing: ["003"]` · `/api/config` = 200 · `/api/pets`, `/api/pets/:id`, `/api/announcements` = 200 · `/api/admin/me` ไม่มี token = 401 · หน้าเว็บเดิมใช้ได้ (Frontend เดิม + Backend ใหม่ เข้ากันได้: API เพิ่มอย่างเดียว · `CANCELLED` เกิดได้เฉพาะเมื่อเปิด `ADOPTION_HANDOVER_WORKFLOW` ซึ่งยังเป็น false · Frontend เดิม refresh token เมื่อได้ 401)
  - Env ใหม่ทั้งหมดมีค่าเริ่มต้น → ไม่ต้องแก้ Vercel env ในรอบนี้
  - ย้อน: Vercel → Promote deployment เดิม `paw-home-backend-rgelmeu7e` (ได้เฉพาะก่อน 003)
- **Gate E:** `apply-production-sql.ps1 -Files database/migrations/003_admin_workflow_contract.sql,database/verification/verify-production-migration.sql,database/verification/verify-adoption-workflow.sql` → `/api/ready` = 200
- **Gate F:** ลบ `VITE_USE_MOCK` ใน Vercel (`paw-home`) → commit 6 → push `main` → ตรวจหน้า Home / รายละเอียด / ล็อกอิน / `/admin` (ไม่ใช่ผู้ดูแล = "ไม่มีสิทธิ์เข้าถึง") · ย้อน: Promote `paw-home-k6bui26ho`
- **Gate G:** แต่งตั้ง SUPER_ADMIN (ต้องได้ UUID จากเจ้าของโปรเจกต์)

### 3.5 ตรวจหลัง migrate

- [ ] จำนวน profiles / pets / favorites / adoption_requests เท่าก่อน migrate (preflight แถว 30, 34)
- [ ] `select count(*) from adoption_requests where stage = 'COMPLETED'` = 0 (ก่อนผู้ดูแลตัดสิน)
- [ ] `select count(*) from adoption_requests where legacy_review` = จำนวน APPROVED เดิม
- [ ] `_prisma_migrations` อ่านจาก anon ไม่ได้ (001 ปิดสิทธิ์ให้)

### 3.6 Prisma migration history (`_prisma_migrations`)

| | Production | Repository |
| --- | --- | --- |
| รายการ | `20261127000000_init` 1 แถว · checksum `1b2666ae…` · `applied_steps_count = 0` · started = finished = 2026-11-27 05:13:32 UTC · ไม่มี log | ไม่มี `backend/prisma/migrations/` เลย (ไม่เคยมีใน git history) |
| ที่มา | ไม่ได้มาจาก Vercel (ไม่มี deploy วันนั้น · build ไม่มี migrate) และไม่ได้มาจาก session ของ Claude · รูปแบบตรงกับ `prisma migrate resolve --applied 20261127000000_init` (baseline: บันทึกว่ารันแล้วโดยไม่รัน SQL) จากเครื่องที่มีโฟลเดอร์ migration นั้น · ไม่พบโฟลเดอร์นี้บนเครื่องนี้ | — |
| ผลต่อ schema | ไม่มี (0 steps) · ตารางจริงมาจาก `database/schema.sql` ตั้งแต่ 2 พ.ย. | — |

แนวทาง (รักษาข้อมูลเดิม · ไม่ลบ/ไม่แก้แถวใน `_prisma_migrations`):

1. **แนะนำ: คงไว้แบบไม่ใช้งาน** — SQL ใน `database/` เป็นแหล่งความจริงเดียว · ห้ามรัน `prisma migrate deploy/dev/reset` และ `prisma db push` กับ Production (ข้อห้ามเดิม) · ปิดสิทธิ์ด้วย 000
2. ถ้าภายหลังจะใช้ Prisma Migrate จริง: สร้าง baseline ใหม่จาก schema หลัง 003 ด้วย `prisma migrate diff --from-empty --to-schema-datamodel` เป็น `<ts>_baseline` แล้ว `prisma migrate resolve --applied <ts>_baseline` (เพิ่มแถวใหม่ ไม่แก้แถวเดิม · ต้องอนุมัติ) · `20261127000000_init` จะเป็นรายการที่ไม่มีไฟล์ — `migrate deploy` จะเตือนแต่ไม่ลบอะไร
3. ถามเจ้าของบัญชีว่าใครรัน `migrate resolve` เวลา 12:13 (เวลาไทย) 27 พ.ย. เพื่อปิดเรื่องที่มา

## 4. ทดสอบหลัง deploy (Preview ก่อน แล้ว Production)

- [ ] ไม่ล็อกอิน → `/admin` แสดงหน้าเข้าสู่ระบบ · `GET /api/admin/me` = 401
- [ ] ผู้ใช้ทั่วไป → หน้า "ไม่มีสิทธิ์เข้าถึง" · API = 403
- [ ] ADMIN เรียก `PUT /api/admin/admins/:id` = 403 และมี audit `permission.denied`
- [ ] ระงับบัญชีทดสอบแล้ว บัญชีนั้นเรียก API ได้ 403 → เปิดใช้งานคืน
- [ ] ซ่อนโพสต์ทดสอบ → หายจาก `GET /api/pets` → แสดงคืน
- [ ] สร้างประกาศ (`isDemo` หรือฉบับร่าง) → ลบ
- [ ] `GET /api/pets` และ `GET /api/pets/:id` ไม่มีเบอร์โทรหรือข้อความ
- [ ] CORS: `CORS_ORIGIN` เป็นโดเมนหน้าเว็บเท่านั้น

## 5. Cron (Vercel)

- Hobby plan รัน cron ได้ **วันละครั้ง** และเวลาคลาดเคลื่อนได้ภายในชั่วโมงนั้น
- เกณฑ์ 24 / 48 / 72 ชม. จึงบันทึกเหตุการณ์ช้าได้สูงสุดเกือบ 1 วัน
- คิวในหน้าผู้ดูแลไม่ได้พึ่ง cron: คำนวณความเร่งด่วนสดทุกครั้งที่เปิด

เพิ่มใน `backend/vercel.json` (ยังไม่ได้สร้างไฟล์ เพราะยังไม่ deploy):

```json
{ "crons": [{ "path": "/api/internal/cron/follow-ups", "schedule": "0 2 * * *" }] }
```

Vercel ส่ง `Authorization: Bearer $CRON_SECRET` ให้เองเมื่อมีตัวแปร `CRON_SECRET`

งานนี้สร้างเฉพาะ `notification_events` · ไม่อนุมัติ / ปฏิเสธ / ปิด / ลบ และไม่ส่งอีเมลหรือ SMS

## 6. Rollback (ย้อนทีละขั้น จากขั้นล่าสุด)

| ถึงขั้น | วิธีย้อน | ข้อมูลที่เสีย |
| --- | --- | --- |
| 7 frontend | Vercel → Promote deployment ก่อนหน้า | ไม่มี |
| 5 (003) | `003_admin_workflow_contract.rollback.sql` (ถอด constraint เท่านั้น) | ไม่มี |
| 4 backend | rollback 003 **ก่อน** แล้ว Promote backend deployment เดิม | ไม่มี |
| 2 (002) | `002_notifications_announcements.rollback.sql` | แจ้งเตือนตามเหตุการณ์ / ของประกาศ |
| 1 (001) | Backend ต้องเป็นรุ่นเดิมแล้ว → `001_admin_workflow.rollback.sql` | ตารางใหม่ทั้งหมด (export ก่อน) · CANCELLED → REJECTED |
| 0 (000) | ไม่ควรย้อน (เปิดช่องโหว่คืน) · ถ้าจำเป็น: `000_lock_prisma_migrations.rollback.sql` | ไม่มี |
| ฉุกเฉิน | `pg_restore` จาก dump ข้อ 3.3 | ทุกอย่างหลัง backup |

ถอนสิทธิ์ผู้ดูแลได้ทันทีโดยไม่ต้อง deploy: ลบแถวใน `admin_memberships` · รายละเอียด: [admin-migration-plan.md → Rollback](admin-migration-plan.md#rollback)

## สถานะการตรวจ

| หัวข้อ | สถานะ |
| --- | --- |
| Environment Variables (ตรวจกับโค้ด) | PASS (local) |
| Admin RBAC | PASS (local: API tests + browser E2E) · BLOCKED (Supabase Dev) |
| Supabase Connection / Auth Redirect | NOT TESTED (ไม่ได้เปลี่ยน) |
| Prisma schema ตรงกับ SQL | PASS (local) |
| CORS | PASS (local) |
| Vercel Function Runtime | NOT TESTED (ยังไม่ deploy) |
| Storage Permissions | Production: bucket `pet-images` public · 7 ไฟล์ (preflight) · ลบรูปเก่าเมื่อเปลี่ยน/ลบโพสต์: PASS (API test) |
| Database Migration | PASS (PGlite: compatibility matrix + preflight) · Preflight Production PASS · BLOCKED (apply ต้องอนุมัติ) |
| Rollback | PASS (PGlite) · NOT TESTED (Supabase) |
