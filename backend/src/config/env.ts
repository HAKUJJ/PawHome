import { isIP } from "node:net";
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
// · หรือรายการ IP/subnet/ชื่อกลุ่ม (loopback, linklocal, uniquelocal) คั่นด้วย ,
// ตรวจที่นี่ก่อน ไม่งั้นค่าผิด (เช่น "ๅ" = กดเลข 1 ตอนแป้นพิมพ์เป็นภาษาไทย) ไปพังใน app.set("trust proxy") ตอนโหลด ทำให้ Function ล่มทุก route
const PROXY_PRESETS = new Set(["loopback", "linklocal", "uniquelocal"]);
const isProxyAddress = (token: string) => {
  if (PROXY_PRESETS.has(token)) return true;
  const [ip, bits, ...rest] = token.split("/");
  const version = isIP(ip);
  if (!version || rest.length) return false;
  return bits === undefined || (/^\d+$/.test(bits) ? Number(bits) <= (version === 4 ? 32 : 128) : isIP(bits) === 4);
};
export const trustProxySchema = z
  .string()
  .default("false")
  .refine((v) => /^(true|false|\d+)$/.test(v) || v.split(",").every((t) => isProxyAddress(t.trim())), {
    message: "TRUST_PROXY ต้องเป็น true / false / จำนวน proxy (Vercel ใช้ 1) หรือรายการ IP/subnet — ตรวจว่าไม่ได้พิมพ์ตอนแป้นพิมพ์เป็นภาษาไทย",
  })
  .transform((v) => (v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v));

const perMinute = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const hours = (fallback: number) => z.coerce.number().int().positive().max(24 * 30).default(fallback);
const flag = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

// ค่าที่วางใน Vercel Dashboard มักติดมาจากไฟล์ .env: ช่องว่าง, เครื่องหมายคำพูดครอบ, คอมเมนต์ท้ายบรรทัด, ค่าว่าง
// → ล้างก่อนตรวจ (ค่าว่าง = ไม่ได้ตั้ง ใช้ค่าเริ่มต้น) ไม่ให้ Function พังทั้งตัวเพราะ RATE_LIMIT_*="10"
export function normalizeEnv(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw === undefined) continue;
    let value = raw.trim();
    const quoted = value.match(/^(["'])(.*)\1$/);
    if (quoted) value = quoted[2].trim();
    else value = value.replace(/\s+#.*$/, ""); // KEY=10 # คอมเมนต์
    out[key] = value === "" ? undefined : value;
  }
  return out;
}

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
  // false (ค่าเริ่มต้น) = เจ้าของอนุมัติแล้วน้องเป็น ADOPTED ทันทีแบบเดิม แต่ทุกคำขอเข้าคิวให้ผู้ดูแลยืนยันการส่งมอบ
  // true = ขั้นตอนส่งมอบเต็ม (ตอบรับ → นัดส่งมอบ → รายงานสองฝ่าย → ยืนยัน) · เปิดเมื่อหน้าเว็บสาธารณะมีปุ่มรายงานส่งมอบแล้ว
  ADOPTION_HANDOVER_WORKFLOW: flag,
  // นโยบายติดตาม: เจ้าของเงียบขณะ PENDING กี่ชั่วโมง → เตือน / ผู้ดูแลติดตาม / ส่งต่อเร่งด่วน
  FOLLOW_UP_REMINDER_HOURS: hours(24),
  FOLLOW_UP_ADMIN_HOURS: hours(48),
  FOLLOW_UP_ESCALATION_HOURS: hours(72),
  // Vercel Cron ส่ง "Authorization: Bearer <CRON_SECRET>" · ไม่ตั้ง = ปิด endpoint cron
  CRON_SECRET: z.string().min(32, "CRON_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร").optional(),
}).refine((e) => e.FOLLOW_UP_REMINDER_HOURS < e.FOLLOW_UP_ADMIN_HOURS && e.FOLLOW_UP_ADMIN_HOURS < e.FOLLOW_UP_ESCALATION_HOURS, {
  message: "FOLLOW_UP_*_HOURS ต้องเรียง REMINDER < ADMIN < ESCALATION",
});

export const envSchema = schema;

const parsed = schema.safeParse(normalizeEnv(process.env));
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((i) => (i.code === "custom" ? i.message : `${i.path.join(".")}: ${i.message}`))
    .join(" · ");
  throw new Error(`ตั้งค่า environment ไม่ครบ/ไม่ถูกต้อง: ${problems} (ดู backend/.env.example)`);
}

export const env = {
  ...parsed.data,
  APP_URL: parsed.data.APP_URL ?? parsed.data.CORS_ORIGIN.split(",")[0].trim(),
};
