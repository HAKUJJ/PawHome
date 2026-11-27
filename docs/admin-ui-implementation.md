# PawHome Admin Preview — Implementation

> **หมายเหตุ (27 พ.ย. 2026):** เอกสารนี้บันทึกสถานะ ณ ตอนเขียน · ปัจจุบันไม่มี `VITE_USE_MOCK`, `VITE_ADMIN_PREVIEW`, `VITE_ADMIN_REAL`, `src/api/mockPets.ts` และ `admin-preview.e2e.mjs` แล้ว — ทั้งเว็บและ `/admin` ใช้ข้อมูลจริงจาก Backend เท่านั้น

## เปิดใช้งาน
```bash
cd frontend
# .env: VITE_ADMIN_PREVIEW=true (ค่าเริ่มต้นใน .env.example = false)
npm run dev            # http://localhost:5173/admin
```
Route `/admin/*` ถูกเพิ่มใน `router.tsx` เฉพาะเมื่อ `import.meta.env.DEV && import.meta.env.VITE_ADMIN_PREVIEW === "true"` และโหลดแบบ lazy · ตอน `vite build` เงื่อนไขเป็น false จึงไม่มีโค้ด Admin ใน bundle (ตรวจแล้ว: ไม่มีข้อความ/route/CSS ของ Admin ใน `dist` แม้ตั้ง flag เป็น true · `/admin` บน production build แสดงหน้า 404)

**Mock Preview ไม่ใช่ระบบความปลอดภัย** — ไม่มี RBAC ห้ามใช้จัดการ Production

## Real Mode (ข้อมูลจริง)
- เปิดด้วย `VITE_ADMIN_REAL=true` (ใช้ได้ทั้ง dev และ production build) · มีผลเหนือ `VITE_ADMIN_PREVIEW`
- `admin/api.ts` เรียก `/api/admin/*` ผ่าน `api/client.ts` เดิม แล้วแปลงเป็นรูปแบบของ store · `admin/real.ts` โหลด / รีเฟรช / ส่งการกระทำไป Backend
- ต้องผ่าน `GET /api/admin/me` ก่อนแสดงอะไร · หน้าจอ ตรวจสอบสิทธิ์ / เข้าสู่ระบบ / ไม่มีสิทธิ์ / เชื่อมต่อไม่สำเร็จ
- store เริ่มว่าง ไม่มี fallback ข้อมูลจำลอง (`seed()` ถูกตัดทิ้งตอน build)
- รายละเอียด: [admin-fullstack-implementation.md](admin-fullstack-implementation.md)

## ไฟล์
| ไฟล์ | หน้าที่ |
| --- | --- |
| `admin/workflow.ts` | กฎขั้นตอน (ฟังก์ชันล้วน): `transition`, `followUp`, `reportsMatch`, `currentStep`, `createCase` |
| `admin/store.ts` | Zustand store: Mock (ผู้ใช้ 18 · สัตว์ 23 · เคส 25 · ประกาศ 4) หรือว่าง (Real Mode) · `change` / `act` / `reset` · `ADMIN_REAL` |
| `admin/api.ts`, `admin/real.ts` | Real Mode: client + แปลงข้อมูล + โหลด/เปลี่ยนข้อมูลผ่าน Backend |
| `admin/ui.tsx`, `admin/admin.css` | องค์ประกอบร่วม + สไตล์ (CSS ธรรมดาบนโทเคนเดิม) |
| `admin/AdminPreview.tsx` | Layout + routes + ค้นหา |
| `admin/Dashboard.tsx` | ภาพรวม + `metrics()` / `weekly()` |
| `admin/Pets.tsx` | ตาราง กรอง เรียง แบ่งหน้า drawer · ผลตรวจโพสต์ (อนุมัติ / ส่งกลับไปแก้ไข พร้อมเหตุผล) · ซ่อน · ลบ |
| `admin/Adoptions.tsx` | รายการคำขอ · รายละเอียดเคส · `StepIndicator` · `Timeline` · `HandoverDetails` |
| `admin/People.tsx` | ผู้ใช้งาน |
| `admin/Content.tsx` | ประชาสัมพันธ์ |
| `admin/Reports.tsx` | รายงาน + `report()` + CSV |
| `admin/Settings.tsx` | ตั้งค่าพรีวิว |
| `components/Dialog.tsx`, `components/ConfirmDialog.tsx` | ใช้ร่วมกับเว็บหลัก (แทน `window.confirm` ทั้ง 5 จุด) |

## กฎข้อมูลจำลอง
- ทุกเคสสร้างผ่าน `transition()` ไทม์ไลน์/รายงานจึงตรงกับขั้นตอน · ทุกสัตว์อ้างอิงเจ้าของที่มีอยู่ · ทุกคำขออ้างอิงสัตว์และผู้ขอที่มีอยู่
- น้องหนึ่งตัวมีคำขอที่ตอบรับแล้วได้ทีละคำขอ และรับเลี้ยงสำเร็จได้ครั้งเดียว
- ทุกการเปลี่ยนแปลงผ่าน `change()` / `act()` จึงเพิ่มรายการในประวัติกิจกรรม
- อยู่ในหน่วยความจำเท่านั้น (ไม่ใช้ localStorage) · ไม่ import `api/*` หรือ `useAuthStore` · E2E ยืนยัน 0 fetch/XHR ออกนอก dev server
- KPI หน้าภาพรวมกับรายงานใช้ข้อมูลชุดเดียว มี unit test ยืนยันว่าตรงกัน
- เลื่อนเวลาจำลอง (+24/48/72 ชม.) ได้ในหน้าตั้งค่า เพื่อดูเคสข้ามเกณฑ์

## สาเหตุ Test Runner ล้มก่อนเริ่มทดสอบ
`seed()` ถูกเรียกตอนสร้าง store ระหว่างโหลดโมดูล แล้วเรียก helper ที่ประกาศเป็น `const` ไว้ด้านล่าง → `ReferenceError: Cannot access 'userName' before initialization` ทั้งไฟล์เทสต์ล้มก่อนรัน (runner failure ไม่ใช่ test failure) · แก้โดยเปลี่ยน helper เป็น `function` declaration · มี regression test ของ step indicator และ store ใน `workflow.test.ts`

## ทดสอบ
```bash
npx tsc -b && npm test && npm run build
VITE_ADMIN_PREVIEW=true VITE_USE_MOCK=true npx vite --port 5181
PAWHOME_PLAYWRIGHT=<path>/playwright/index.mjs PAWHOME_URL=http://localhost:5181 PAWHOME_SHOTS=./shots node scripts/admin-preview.e2e.mjs
# Real Mode: ดู scripts/admin-real.e2e.mjs (Backend จริง + PGlite จาก backend/tests/e2e/server.ts)
```
