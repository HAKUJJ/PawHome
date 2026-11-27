import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { routes } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");
// อยู่หลัง reverse proxy ให้ตั้ง TRUST_PROXY=จำนวน proxy ไม่งั้นทุกคนได้ IP ของ proxy และโดน rate limit รวมกัน
// Vercel: ตั้ง TRUST_PROXY=1 — Vercel เขียนทับ X-Forwarded-For ด้วย IP จริงของผู้ใช้ทุกครั้ง (client ปลอมค่าเข้ามาไม่ได้)
app.set("trust proxy", env.TRUST_PROXY);
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()) }));
app.use(express.json({ limit: "100kb" }));

// สถานะ migration ที่ Backend รุ่นนี้ต้องใช้ (อ่านอย่างเดียว) · null = ต่อฐานข้อมูลไม่ได้
async function migrationState(): Promise<Record<"001" | "002" | "003", boolean> | null> {
  try {
    const [row] = await prisma.$queryRaw<{ m001: boolean; m002: boolean; m003: boolean }[]>`select
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'adoption_requests' and column_name = 'stage') as m001,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'announcements' and column_name = 'publish_at') as m002,
      exists (select 1 from pg_constraint where conname = 'adoption_requests_stage_status_consistent') as m003`;
    return { "001": row.m001, "002": row.m002, "003": row.m003 };
  } catch {
    return null;
  }
}
const missingOf = (state: Record<string, boolean>) => Object.keys(state).filter((key) => !state[key]);

// Liveness: server ทำงานและต่อฐานข้อมูลได้ (ต่อไม่ได้ = 503) · schema แสดงเป็นข้อมูลประกอบ ไม่ทำให้ health ล้ม
// ช่วง rollout (001/002 แล้ว แต่ 003 ยังไม่รัน) จึงไม่ถูกตัดว่า server ล่ม
app.get("/api/health", async (_req, res) => {
  const state = await migrationState();
  if (!state) {
    res.status(503).json({ status: "error", database: "unreachable" });
    return;
  }
  const missing = missingOf(state);
  res.json({ status: "ok", database: "ok", schema: missing.length ? "pending" : "ok", ...(missing.length ? { missing } : {}) });
});

// Readiness: พร้อมให้บริการครบทุกฟีเจอร์ของ Backend รุ่นนี้ = ต่อฐานข้อมูลได้ + migration 001–003 ครบ (ไม่ครบ = 503 พร้อมบอกเลขที่ขาด)
app.get("/api/ready", async (_req, res) => {
  const state = await migrationState();
  if (!state) {
    res.status(503).json({ status: "not_ready", database: "unreachable" });
    return;
  }
  const missing = missingOf(state);
  if (missing.length) res.status(503).json({ status: "not_ready", database: "ok", schema: "missing migrations", missing });
  else res.json({ status: "ready", database: "ok", schema: "ok" });
});

app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

// Vercel (Express zero-config) ใช้ default export นี้เป็น Function · เครื่อง dev ใช้ src/server.ts ที่เรียก listen
export default app;
