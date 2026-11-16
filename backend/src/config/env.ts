import { z } from "zod";

// โหลด backend/.env ถ้ามี (Node 22 มีให้ในตัว ไม่ต้องใช้ dotenv) — บน server จริงตั้ง env ผ่านระบบแทน
try {
  process.loadEnvFile();
} catch {
  // ไม่มีไฟล์ .env ก็ใช้ค่าจาก environment ตรง ๆ
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Project URL ของ Supabase เท่านั้น เช่น https://abcd.supabase.co (ไม่มี /rest/v1, query หรือ #)
// https สำหรับโปรเจกต์บน Supabase · http ได้เฉพาะ localhost (supabase start)
export const supabaseUrlSchema = z.string().superRefine((value, ctx) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "SUPABASE_URL ไม่ใช่ URL" });
    return;
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    ctx.addIssue({ code: "custom", message: "SUPABASE_URL ต้องเป็น https:// (http:// ได้เฉพาะ localhost)" });
  if (url.pathname !== "/" || url.search || url.hash || url.username)
    ctx.addIssue({
      code: "custom",
      message: `SUPABASE_URL ต้องเป็น Project URL อย่างเดียว เช่น ${url.protocol}//${url.host} (ตัด "${url.pathname}${url.search}${url.hash}" ออก)`,
    });
});

// express "trust proxy": false = ใช้ IP ที่ต่อเข้ามาตรง ๆ (ไม่เชื่อ X-Forwarded-For) · ตัวเลข = จำนวน proxy ข้างหน้า
const trustProxySchema = z
  .string()
  .default("false")
  .transform((v) => (v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v));

const perMinute = (fallback: number) => z.coerce.number().int().positive().default(fallback);
// ค่าว่างใน .env (เช่น UPSTASH_REDIS_REST_URL=) = ไม่ได้ตั้ง
const optional = <T extends z.ZodTypeAny>(inner: T) => z.preprocess((v) => (v === "" ? undefined : v), inner.optional());

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"), // หลายโดเมนคั่นด้วย ,
  // หน้าเว็บที่ลิงก์ยืนยันอีเมลพากลับมา (ต้องอยู่ใน Supabase → Authentication → URL Configuration → Redirect URLs)
  APP_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: supabaseUrlSchema,
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STORAGE_BUCKET: z.string().default("pet-images"),
  TRUST_PROXY: trustProxySchema,
  RATE_LIMIT_LOGIN_PER_MINUTE: perMinute(10),
  RATE_LIMIT_REGISTER_PER_MINUTE: perMinute(10),
  RATE_LIMIT_REFRESH_PER_MINUTE: perMinute(30), // refresh เกิดเองอัตโนมัติ ทุกแท็บ ทุกผู้ใช้หลัง NAT เดียวกัน
  // ตัวนับ rate limit ร่วมกันทุก instance (Upstash Redis REST) — ต่อผ่าน Vercel Marketplace จะได้ชื่อ KV_REST_API_*
  UPSTASH_REDIS_REST_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),
  KV_REST_API_URL: optional(z.string().url()),
  KV_REST_API_TOKEN: optional(z.string()),
  VERCEL: optional(z.string()), // Vercel ตั้งให้เองเป็น "1" ทั้งตอน build และตอนรัน
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((i) => (i.code === "custom" ? i.message : `${i.path.join(".")}: ${i.message}`))
    .join(" · ");
  throw new Error(`ตั้งค่า environment ไม่ครบ/ไม่ถูกต้อง: ${problems} (ดู backend/.env.example)`);
}

const REDIS_REST_URL = parsed.data.UPSTASH_REDIS_REST_URL ?? parsed.data.KV_REST_API_URL;
const REDIS_REST_TOKEN = parsed.data.UPSTASH_REDIS_REST_TOKEN ?? parsed.data.KV_REST_API_TOKEN;

// Vercel = serverless หลาย instance → ตัวนับในหน่วยความจำกัน brute force ไม่ได้จริง ต้องมี Redis
if (parsed.data.VERCEL && !(REDIS_REST_URL && REDIS_REST_TOKEN)) {
  throw new Error(
    "รันบน Vercel ต้องตั้ง UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (หรือ KV_REST_API_URL + KV_REST_API_TOKEN) สำหรับ rate limit (ดู backend/.env.example)",
  );
}

export const env = {
  ...parsed.data,
  APP_URL: parsed.data.APP_URL ?? parsed.data.CORS_ORIGIN.split(",")[0].trim(),
  REDIS_REST_URL,
  REDIS_REST_TOKEN,
};
