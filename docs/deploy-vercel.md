# Deploy บน Vercel (Frontend + Backend)

Repository เดียว (`HAKUJJ/PawHome`, branch `main`) → Vercel 2 Projects · ใช้ Supabase เดิม ไม่สร้างฐานข้อมูลใหม่ ไม่รัน migrate

| Project | Root Directory | Framework Preset | ได้ URL เป็น |
|---|---|---|---|
| `pawhome-api` | `backend` | Express | `https://<api-domain>` → API อยู่ที่ `https://<api-domain>/api/...` |
| `pawhome-web` | `frontend` | Vite | `https://<web-domain>` |

ลำดับ: **Upstash Redis → pawhome-api → pawhome-web → กลับไปตั้ง CORS/APP_URL ของ api → Supabase Auth URLs → ทดสอบ**

## 1. Upstash Redis (rate limit ร่วมกันทุก instance)

Vercel Functions มีหลาย instance และสร้างใหม่ได้ตลอด ตัวนับในหน่วยความจำจึงกัน brute force ไม่ได้ → Backend **ไม่ยอมเริ่มทำงานบน Vercel** ถ้าไม่มี Redis

- ทางที่ง่ายที่สุด: Vercel Dashboard → project `pawhome-api` → Storage → Marketplace → **Upstash for Redis** (Free) → Connect → Vercel ใส่ `KV_REST_API_URL` / `KV_REST_API_TOKEN` ให้เอง
- หรือสร้างที่ console.upstash.com แล้วใส่ `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` เอง
- Redis ล่ม/ตอบช้าเกิน 2 วินาที → ปล่อยผ่าน (fail-open) และ log `rate limit store:` · Supabase Auth ยังมี rate limit ของตัวเองอีกชั้น
- เสริม (ไม่บังคับ): Vercel Firewall → Rate Limiting (Hobby ได้ 1 rule) เช่น path `/api/auth/` 60 ครั้ง/นาที/IP เป็นด่านแรกก่อนถึง Function

## 2. pawhome-api (backend/)

Vercel → Add New Project → Import `HAKUJJ/PawHome` → Project Name `pawhome-api` → Root Directory `backend` → Framework `Express` (ไม่ต้องแก้ Build/Output/Install Command)

Entry point: Vercel ตรวจเจอ `src/app.ts` (export default app) เอง · `src/server.ts` ยังใช้รัน `npm run dev` ในเครื่องเหมือนเดิม · Prisma Client ถูก generate ตอน `npm install` (postinstall) พร้อม engine `rhel-openssl-3.0.x` ของ Vercel

### Environment Variables (Production)

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` 🔒 | Supabase → Connect → **Transaction pooler** (พอร์ต `6543`) + `?pgbouncer=true&connection_limit=1` | serverless เปิด connection ใหม่บ่อย ต้องผ่าน pooler · `pgbouncer=true` = Prisma 6 ไม่ใช้ prepared statement (PgBouncer โหมด transaction ไม่รองรับ) · `connection_limit=1` = 1 connection ต่อ instance |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Project URL อย่างเดียว |
| `SUPABASE_ANON_KEY` | anon / publishable key | |
| `SUPABASE_SERVICE_ROLE_KEY` 🔒 | service_role / secret key | ห้ามใส่ใน pawhome-web |
| `STORAGE_BUCKET` | `pet-images` | |
| `CORS_ORIGIN` | `https://<web-domain>` | ไม่มี `/` ท้าย · หลายโดเมนคั่นด้วย `,` (ใส่ทีหลังเมื่อได้ URL ของ web) |
| `APP_URL` | `https://<web-domain>` | ลิงก์ยืนยันอีเมลพากลับมา `<APP_URL>/login?verified=1` |
| `TRUST_PROXY` | `1` | ตรวจแล้ว: Vercel เขียนทับ `X-Forwarded-For` ด้วย IP จริงของผู้ใช้ทุกครั้งและไม่ส่งต่อค่าที่ client ปลอมมา ([เอกสาร](https://vercel.com/docs/headers/request-headers)) → proxy 1 ชั้น |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` 🔒 | จาก Upstash integration | หรือ `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| `RATE_LIMIT_*` | ไม่ต้องตั้ง (10 / 10 / 30) | เพิ่มได้ก่อนเดโมทั้งห้อง |

ไม่ต้องตั้ง `PORT` (Vercel จัดการเอง) · `VERCEL=1` Vercel ตั้งให้เอง

ทดสอบ: `https://<api-domain>/api/health` → `{"status":"ok","database":"ok"}`

## 3. pawhome-web (frontend/)

Add New Project → Import repo เดิมอีกครั้ง → Project Name `pawhome-web` → Root Directory `frontend` → Framework `Vite` (Build `npm run build`, Output `dist`)

| ตัวแปร | ค่า |
|---|---|
| `VITE_API_URL` | `https://<api-domain>/api` — ต้องลงท้าย `/api` ครั้งเดียว (route ทั้งหมดของ Backend อยู่ใต้ `/api` และ client ต่อ path เช่น `/pets` เอง) |
| `VITE_USE_MOCK` | `false` |

- ตัวแปร `VITE_*` ถูกฝังตอน build → แก้แล้วต้อง **Redeploy**
- ไม่ได้ตั้ง `VITE_API_URL` → หน้าเว็บแสดง "ระบบยังไม่พร้อมใช้งาน" (ไม่แอบใช้ข้อมูลจำลอง) · Backend ล่ม → แต่ละหน้าแสดงกล่อง error พร้อมปุ่มลองใหม่
- `vercel.json` rewrite ทุก path ไป `index.html` → deep link เช่น `/pets/3` กด F5 ได้

จากนั้นกลับไป pawhome-api ตั้ง `CORS_ORIGIN` และ `APP_URL` = `https://<web-domain>` แล้ว Redeploy pawhome-api

## 4. Supabase Dashboard (Authentication)

ใช้ URL จริงของ pawhome-web เท่านั้น (ไม่แก้ข้อมูลผู้ใช้)

| ตั้งค่า | ค่า |
|---|---|
| URL Configuration → Site URL | `https://<web-domain>` |
| URL Configuration → Redirect URLs | เพิ่ม `https://<web-domain>/login` (คง `http://localhost:5173/login` ไว้สำหรับ dev ได้) |
| Sign In / Providers → Email → Confirm email | เปิด |
| Emails → SMTP Settings | ตั้ง Custom SMTP ก่อนเปิดให้คนทั่วไปสมัคร (ผู้ส่งในตัวส่งได้ 2 ฉบับ/ชม./โปรเจกต์) |
| Rate Limits | ทุกคำขอมาจาก IP ของ Vercel → เพิ่มค่า `/token` ถ้าเดโมพร้อมกันหลายคน |

Refresh token / หลายแท็บ: ทำที่ client (`frontend/src/api/client.ts` + Web Locks) ไม่ขึ้นกับโดเมน ไม่ต้องตั้งเพิ่ม

## 5. ข้อจำกัดของ Vercel ที่เกี่ยวข้อง

- Request body สูงสุด 4.5 MB ต่อ request — อัปโหลดรูปจำกัดที่ 2 MB (multer, memory) และ JSON 100 KB จึงไม่ชน
- ระยะเวลา Function ค่าเริ่มต้น 300 วินาที (Fluid compute) · เรียก Redis มี timeout 2 วินาที
- รูปอัปโหลดไป Supabase Storage โดยตรง ไม่เขียนดิสก์ของ Function

## 6. Checklist ทดสอบหลัง Deploy (บน URL จริง)

- [ ] `/api/health` → ok
- [ ] สมัคร → ได้อีเมลยืนยัน → กดลิงก์กลับมา `https://<web-domain>/login?verified=1`
- [ ] Login ด้วยบัญชีทดลอง · Login ผิด 11 ครั้งใน 1 นาที → 429
- [ ] ดูรายการ/รายละเอียดสัตว์ · โพสต์/แก้/ลบ (เจ้าของเท่านั้น)
- [ ] อัปโหลดรูป (≤ 2 MB, JPG/PNG/WEBP)
- [ ] Favorites เพิ่ม/ลบ · คำขอรับเลี้ยง ส่ง/ยกเลิก/อนุมัติ
- [ ] แก้ชื่อในหน้าโปรไฟล์
- [ ] เปิดทิ้งไว้เกิน 1 ชม. (หรือ 2 แท็บ) → ต่ออายุ token อัตโนมัติ ไม่หลุด
- [ ] เปิด `/pets/1`, `/me` ตรง ๆ แล้ว F5 · ทดสอบบนมือถือ
- [ ] DevTools → Network: ไม่มี CORS error · ไม่มี service role key ในไฟล์ JS ของหน้าเว็บ
