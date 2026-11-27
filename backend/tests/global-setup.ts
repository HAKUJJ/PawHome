// ฐานข้อมูลทดสอบ: PostgreSQL จริง (PGlite) รัน schema.sql + migrations → สร้างบัญชีทดลอง → mock-data.sql → verify*.sql
// แล้วเปิดเป็น TCP ให้ Prisma ต่อเหมือนต่อ Supabase — ไม่ต้องใช้ Docker หรือ credentials
// มี 2 ก้อน: api.test ใช้ก้อนหลัก (นับจำนวนแถวตาม seed) · เทสต์ admin ใช้ก้อนแยก จะสร้างข้อมูลเท่าไรก็ไม่กระทบกัน
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync } from "node:fs";
import type { TestProject } from "vitest/node";
import { DEMO_USERS } from "./demo-users.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
// ลำดับเดียวกับ Production: 001 (expand) → 002 → 003 (contract หลัง deploy Backend ใหม่)
export const MIGRATIONS = [
  "../../database/migrations/001_admin_workflow.sql",
  "../../database/migrations/002_notifications_announcements.sql",
  "../../database/migrations/003_admin_workflow_contract.sql",
];

export type VerifyRow = { check_name: string; expected: string; actual: string; ok: boolean };

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    adminDatabaseUrl: string;
    verifyRows: VerifyRow[];
    verifyAdminRows: VerifyRow[];
  }
}

const urlFor = (port: number) =>
  // PGlite มี session เดียวใช้ร่วมกันทุก connection → pgbouncer=true ให้ Prisma ไม่ทิ้ง prepared statement ชื่อซ้ำไว้ข้ามไฟล์เทสต์
  `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`;

// mockData: false = ไม่ใส่ database/mock-data.sql (โหมดสาธิตที่ใช้ชุดข้อมูลเล็กอย่างเดียว)
export async function seededDb({ mockData = true } = {}) {
  const db = await PGlite.create();
  await db.exec(read("./supabase-stub.sql"));
  await db.exec(read("../../database/schema.sql"));
  for (const file of MIGRATIONS) await db.exec(read(file));
  // บน Supabase จริงขั้นนี้คือ `npm run seed:users` (Admin API) — ในเทสต์ใส่ตรงลงตารางจำลอง
  for (const u of DEMO_USERS) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [u.id, u.email, { name: u.name }]);
  }
  // รันซ้ำสองรอบ: ถ้าไม่ idempotent จะ error หรือจำนวนแถวใน verify.sql จะเพี้ยน
  for (let round = 0; round < 2; round++) {
    await db.exec(read("../../database/schema.sql"));
    for (const file of MIGRATIONS) await db.exec(read(file));
    if (mockData) await db.exec(read("../../database/mock-data.sql"));
  }
  return db;
}

export async function serve(db: PGlite, port: number) {
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();
  return server;
}

export default async function setup(project: TestProject) {
  const db = await seededDb();
  project.provide("verifyRows", (await db.exec(read("../../database/verification/verify.sql"))).at(-1)!.rows as VerifyRow[]);
  project.provide("verifyAdminRows", (await db.exec(read("../../database/verification/verify-admin.sql"))).at(-1)!.rows as VerifyRow[]);
  const adminDb = await seededDb();

  const servers = [await serve(db, 54329), await serve(adminDb, 54330)];
  project.provide("databaseUrl", urlFor(54329));
  project.provide("adminDatabaseUrl", urlFor(54330));

  return async () => {
    for (const server of servers) await server.stop();
    await db.close();
    await adminDb.close();
  };
}
