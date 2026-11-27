// Backend จริง (Express + Prisma + migrations 001–003) บน PostgreSQL จำลอง (PGlite) + Supabase Auth/Storage ปลอม
// สำหรับ Browser E2E โดยไม่ต้องมี credentials · ไม่เชื่อมต่อ Supabase เลย จึงแตะข้อมูลจริงไม่ได้
//
//   cd backend && npx tsx --import ./tests/e2e/loader.mjs tests/e2e/server.ts
//   ตัวเลือก: E2E_DEMO_DATASET=1  โหลดชุดข้อมูลทดสอบ database/seeds/* (40 ผู้ใช้ 100 น้อง 180 คำขอ)
//             E2E_HANDOVER_WORKFLOW=1  เปิดขั้นตอนส่งมอบ (ADOPTION_HANDOVER_WORKFLOW=true)
//             E2E_DATASET=minimal  โหลดชุดข้อมูลสาธิตขนาดเล็ก database/seeds/minimal/seed.sql (6 ผู้ใช้ 10 น้อง 12 คำขอ)
//   (frontend) VITE_API_URL=http://localhost:3101/api npx vite --port 5182
//
//   โหมดสาธิตในเครื่อง:  npm run dev:demo  (= --demo: พอร์ต 3000 + CORS http://localhost:5173 + ชุดข้อมูลเล็ก + เปิดขั้นตอนส่งมอบ)
//   ใช้กับหน้าเว็บที่รันด้วย `npm run dev` ตามปกติ (VITE_API_URL=http://localhost:3000/api) · ข้อมูลหายเมื่อปิด server
//
// บัญชี (รหัส 123456 — บัญชีปลอมใน fake-supabase เท่านั้น): e2e-admin@pawhome.test (SUPER_ADMIN) · pong / shelter / mind @pawhome.test
// + บัญชี demo-XX.*@pawhome.test ทั้ง 40 บัญชีเมื่อเปิด E2E_DEMO_DATASET
import { readFileSync } from "node:fs";
import { DEMO_DATASET_USERS, MINIMAL_DATASET_USERS } from "../../scripts/demo-dataset.js";
import { seededDb, serve } from "../global-setup.js";

// --demo: ค่าที่เหมาะกับการสาธิตบนเครื่อง (ไม่ต้องตั้ง env เอง ใช้ได้ทั้ง PowerShell และ bash)
if (process.argv.includes("--demo")) {
  process.env.E2E_API_PORT ??= "3000";
  process.env.E2E_ORIGIN ??= "http://localhost:5173";
  process.env.E2E_DATASET ??= "minimal";
  process.env.E2E_HANDOVER_WORKFLOW ??= "1";
}

const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 54331);

const demoMode = process.argv.includes("--demo");
const db = await seededDb({ mockData: !demoMode });
await serve(db, DB_PORT);

process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`;
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "e2e-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "e2e-service-role-key";
process.env.CORS_ORIGIN = process.env.E2E_ORIGIN ?? "http://localhost:5182";
process.env.TRUST_PROXY = "false";
process.env.ADOPTION_HANDOVER_WORKFLOW = process.env.E2E_HANDOVER_WORKFLOW === "1" ? "true" : "false";
for (const key of ["RATE_LIMIT_LOGIN_PER_MINUTE", "RATE_LIMIT_REGISTER_PER_MINUTE", "RATE_LIMIT_REFRESH_PER_MINUTE"]) process.env[key] = "10000";

const { registerAccount } = await import("../fake-supabase.js");
const { prisma } = await import("../../src/config/prisma.js");
if (!demoMode) {
  const admin = await registerAccount("e2e-admin@pawhome.test", "ผู้ดูแล E2E");
  await prisma.adminMembership.create({ data: { userId: admin.id, role: "SUPER_ADMIN" } });
}

if (process.env.E2E_DATASET === "minimal") {
  for (const u of MINIMAL_DATASET_USERS) await registerAccount(u.email, u.name);
  await db.exec(readFileSync(new URL("../../../database/seeds/minimal/seed.sql", import.meta.url), "utf8"));
  console.log("minimal demo dataset loaded — บัญชี mini-01…06@pawhome.test รหัส 123456 (บัญชีปลอมในเครื่องเท่านั้น)");
}

if (process.env.E2E_DEMO_DATASET === "1") {
  // บน Supabase จริงคือ npm run seed:demo-users · ที่นี่สร้างบัญชีปลอม (insert auth.users จำลอง) แล้วรัน SQL seed
  for (const u of DEMO_DATASET_USERS) await registerAccount(u.email, u.name);
  const manifest = JSON.parse(readFileSync(new URL("../../../database/seeds/manifest.json", import.meta.url), "utf8")) as { runOrder: string[] };
  for (const file of manifest.runOrder) await db.exec(readFileSync(new URL(`../../../database/seeds/${file}`, import.meta.url), "utf8"));
  console.log(`demo dataset loaded (${manifest.runOrder.length} files)`);
}

const { app } = await import("../../src/app.js");
app.listen(API_PORT, () => console.log(`E2E backend ready on http://localhost:${API_PORT}/api (workflow ${process.env.ADOPTION_HANDOVER_WORKFLOW}, CORS ${process.env.CORS_ORIGIN})`));
