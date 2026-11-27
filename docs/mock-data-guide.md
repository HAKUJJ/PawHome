# Mock Data Guide — ชุดข้อมูลทดสอบ PawHome

| | |
| --- | --- |
| Dataset ID | `pawhome-demo-v1` |
| Dataset Version | `1.0.0` |
| Generator | `backend/scripts/generate-demo-seed.ts` (deterministic: seed คงที่ รันใหม่ได้ไฟล์เดิม) |
| ไฟล์ | `database/seeds/001…010-*.sql`, `999-cleanup-demo.sql`, `manifest.json` |
| ตรวจ | `database/verification/verify-demo-data.sql`, `verify-adoption-workflow.sql`, `verify-rls.sql` (+ `verify-admin.sql`) |

> ⚠️ ข้อมูลสมมติทั้งหมด ใช้กับ Local / PGlite / Supabase **Development-Test** เท่านั้น
> - ทุกไฟล์มี guard: หยุดทันทีถ้าพบข้อมูลของผู้ใช้จริง (`pets` หรือ `adoption_requests` ของอีเมลที่ไม่ใช่ `@pawhome.test`)
> - หยุดถ้าบัญชี demo ไม่ครบ

## จำนวนข้อมูล (นับจากฐานข้อมูลจริงหลัง seed — ดู [database-seed-report.md](database-seed-report.md))

| ข้อมูล | เป้าหมาย | ได้จริง | เหตุผลที่ต่าง |
| --- | --- | --- | --- |
| ผู้ใช้ทดสอบ | 40 | 40 | — |
| น้อง | 100 | 100 | AVAILABLE 25 · PENDING 59 · ADOPTED 16 |
| คำขอรับเลี้ยง | 180 | 180 | — |
| รายการโปรด | 150 | 150 | — |
| ไทม์ไลน์ (`adoption_stage_history`) | 500+ | 393 | คำขอที่ยังรอพิจารณามีเหตุการณ์เดียวตามความจริง · ไม่สร้างขั้นปลอมเพื่อให้ครบ |
| ไทม์ไลน์ที่ผู้ดูแลเห็น (ไทม์ไลน์ + รายงาน + บันทึกติดตาม) | 500+ | 509 | `GET /api/admin/adoptions/:id/timeline` รวมสามแหล่งนี้ |
| บันทึกติดตาม | 80 | 70 | สร้างเฉพาะเคสที่นโยบายต้องติดตามจริง (เกินเวลา / ข้อพิพาท / ระบบเดิม) |
| รายงานส่งมอบ | 60 | 46 | มีเฉพาะคำขอที่ถึงขั้นนัดส่งมอบแล้ว (28 คำขอ) |
| ประกาศ | 12 | 12 | 3 รายการเดิมของหน้าแรก + 9 ตัวอย่าง (เผยแพร่ / ร่าง / หมดอายุ / ตั้งเวลา) |
| แจ้งเตือน | 200 | 569 | สร้างครบตามเหตุการณ์จริง (คำขอใหม่ทุกคำขอ + ทุกขั้น + cron + ประกาศ) |
| Audit log | 100 | 100 | — |

## Persona หลัก (อีเมล `demo-NN.<slug>@pawhome.test`)

| บัญชี | Persona |
| --- | --- |
| `demo-01.superadmin` | SUPER_ADMIN ทดสอบ (Development เท่านั้น) |
| `demo-02.admin.nok`, `demo-03.admin.ton` | ADMIN ทดสอบ |
| `demo-04.shelter.sisa` | บ้านพักพิง โพสต์หลายตัว |
| `demo-05.rescue.paw` | กลุ่มช่วยเหลือ |
| `demo-06.owner.malee` | เจ้าของตอบไว (เคสรับเลี้ยงสำเร็จ) |
| `demo-07.owner.somchai` | เจ้าของไม่ตอบ (คำขอค้าง 80–300 ชม.) |
| `demo-08`…`demo-20` | เจ้าของทั่วไป |
| `demo-21.new.joy` | เพิ่งสมัคร ไม่มีโพสต์ / คำขอ |
| `demo-22.applicant.ning` | ขอรับเลี้ยงหลายครั้ง |
| `demo-23.fav.bow` | รายการโปรด 25 รายการ |
| `demo-24.applicant.tee` | ยกเลิกคำขอ |
| `demo-25.adopter.pop` | รับเลี้ยงสำเร็จ |
| `demo-26.applicant.kwan` | ถูกปฏิเสธ |
| `demo-39.suspended.x` | บัญชีถูกระงับ |

รหัสผ่าน: ไม่มีในเอกสารและไม่มีใน repo
- **Supabase:** กำหนดผ่าน `DEMO_USER_PASSWORD` ตอนรัน `seed:demo-users`
- **E2E บน PGlite:** ใช้บัญชีปลอมใน `backend/tests/fake-supabase.ts` (ไม่ใช่ Supabase)

## สถานการณ์ที่ครอบคลุม

- **คำขอ:**
  - รอพิจารณา 6 ชม. – 12.5 วัน (มีเคสเกิน 24 / 48 / 72 ชม. และเกิน 7 วัน)
  - ตอบรับ · นัดส่งมอบ
  - แจ้งส่งมอบฝ่ายเดียว · ตรงกันยืนยันฝ่ายเดียว · ข้อพิพาท
  - สำเร็จ (ยืนยันครบ / ผู้ดูแลตรวจหลังข้อพิพาท)
  - ปฏิเสธ (โดยเจ้าของ / อัตโนมัติเมื่อน้องได้บ้าน) · ยกเลิกหลังตอบรับ
  - อนุมัติจากระบบเดิมที่รอผู้ดูแลตรวจ
- **ติดตาม:** โทรแล้วไม่รับสาย · ติดต่อไม่สำเร็จ · รอเอกสารเพิ่ม · ส่งต่อเร่งด่วน · ติดตามเสร็จ · ปิดเคส
  - บันทึกเหล่านี้ไม่เปลี่ยน `last_activity_at`
- **น้อง:** ลูกสัตว์ / โต / สูงวัย · วัคซีน / ทำหมันหลากหลาย · ต้องการบ้านด่วน
  - ซ่อน · ส่งกลับแก้ไข · รอตรวจใหม่ · ไม่มีรูป · ลิงก์รูปเสียโดยตั้งใจ (ทดสอบ fallback)
- **รูป:**
  - ใช้รูปสาธารณะชุดเดียวกับ `database/mock-data.sql` (dog.ceo / thecatapi) และ `/pawhome-cat.png` ในโปรเจกต์
  - ไม่สร้าง URL ของ Supabase Storage ที่ไม่มีไฟล์จริง
- **เบอร์โทร:** ขึ้นต้น `00000` (ไม่มีเบอร์จริงในไทยรูปแบบนี้) — เป็นข้อความทดสอบเท่านั้น
- **ประกาศตัวอย่าง:** ติดป้าย `[ตัวอย่าง]` / `is_demo` · ไม่มีที่อยู่รับบริจาคหรือเบอร์ติดต่อจริง

## ลำดับการรัน

### Local / PGlite (ไม่ต้องมี credentials)

```bash
cd backend && npm test        # tests/seed.test.ts: migrate → seed 2 รอบ → verify ทั้งหมด → cleanup → seed ใหม่
```

### Supabase Development (ยังไม่ได้รันจริง — ดู Known Limitations)

1. ฐานข้อมูลต้องมี `database/schema.sql` + `migrations/001` → `002` → `003`
2. สร้างบัญชีผ่าน Admin API (ไม่ insert ลง `auth.users` ตรง):
   ```bash
   cd backend
   SEED_TARGET=development SEED_ALLOWED_PROJECT_REFS=<dev-project-ref> DEMO_USER_PASSWORD=<รหัสทดสอบ ≥12 ตัว> npm run seed:demo-users
   ```
   - สคริปต์หยุดถ้า project ref ไม่อยู่ในรายการที่อนุญาต
   - หยุดถ้ารันบน Vercel / `NODE_ENV=production`
   - ไม่แสดงรหัสผ่าน · ยืนยันอีเมลให้ จึงไม่ส่งอีเมลจริง
3. SQL Editor → รันตาม `manifest.json` → `runOrder`: `001-demo-profiles.sql` … `010-demo-audit.sql`
4. รัน `verify-demo-data.sql`, `verify-adoption-workflow.sql`, `verify-rls.sql`, `verify-admin.sql` → ทุกแถว `ok = true`
5. รันซ้ำข้อ 3 ได้ (ไม่เพิ่มแถว)

### Browser E2E กับชุดข้อมูลนี้

```bash
cd backend && E2E_DEMO_DATASET=1 E2E_HANDOVER_WORKFLOW=1 npx tsx --import ./tests/e2e/loader.mjs tests/e2e/server.ts
```

## Idempotency และการระบุข้อมูล

- id อยู่ในช่วงของชุดข้อมูล (`manifest.json` → `idRanges`):
  - pets 2001–2100 · คำขอ 3001–3999 · ประกาศ 501–520
  - ไทม์ไลน์ / รายงาน / ติดตาม / แจ้งเตือน / audit 910001–959999
- ทุก insert ใช้ `on conflict do nothing` · sequence ถูกตั้งเป็นค่า max หลัง insert
- ผู้ใช้อ้างด้วยอีเมล (ไม่ hardcode UUID ของ auth)
- เวลา: ทุกไฟล์อ้างจุดยึดเดียว (`created_at` ของน้อง id 2001) → ไทม์ไลน์ / แจ้งเตือน / คำขอ ตรงกันทุกไฟล์และทุกรอบ
- แจ้งเตือนอ้างเวลาจากแถวต้นทางจริง (ไทม์ไลน์ / `last_activity_at` / เวลาเผยแพร่)
- Audit log ทุกแถวมี `changes.dataset = 'pawhome-demo-v1'`

## Cleanup

`database/seeds/999-cleanup-demo.sql` (มี guard เดียวกัน · ใช้ transaction · ไม่มี TRUNCATE)
- **ลบ:** น้องในช่วง id ที่เป็นของบัญชี demo (คำขอ / ไทม์ไลน์ / รายงาน / ติดตาม / แจ้งเตือน / รายการโปรด ถูกลบตาม FK) · ประกาศในช่วง id · สิทธิ์ผู้ดูแล / การระงับของบัญชี demo
- **ไม่ลบ:**
  - `admin_audit_logs` (append-only โดยออกแบบ — แยกด้วย `changes.dataset`)
  - บัญชีใน Supabase Auth (ลบผ่าน Dashboard / Admin API)
  - ข้อมูลที่ไม่อยู่ในช่วง id

## Known Limitations

- **ยังไม่ได้รันกับ Supabase Development จริง** (ไม่มี credentials) → การสร้างบัญชีจริง, RLS กับ JWT จริง, Storage = BLOCKED
- รูปหลายรูป / รูปปก / ลำดับรูป: schema มี `image_url` เดียว → ยังไม่รองรับ (ต้องเพิ่มตาราง `pet_images` ในรอบถัดไป)
- `notification preferences` ยังไม่มีใน schema
- แก้ข้อมูลชุดนี้: แก้ generator แล้วรัน `npm run seed:generate` · ห้ามแก้ไฟล์ SQL ด้วยมือ
