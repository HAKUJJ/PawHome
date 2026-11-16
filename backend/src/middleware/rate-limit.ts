import type { RequestHandler } from "express";
import { ApiError } from "./error.js";

const WINDOW_MS = 60_000;

// จำกัดจำนวนครั้งต่อ IP ต่อนาที (fixed window) แยกตาม name — เกินแล้วตอบ 429 + Retry-After
// IP มาจาก req.ip ซึ่งเชื่อ X-Forwarded-For เฉพาะเมื่อตั้ง TRUST_PROXY (app.ts) ไม่งั้นปลอม header ข้าม limit ได้
// นับในหน่วยความจำของ process (สำหรับ Development / Demo) — บน Vercel แต่ละ instance นับแยกกันและเริ่มใหม่เมื่อ instance ถูกสร้างใหม่
// จึงเป็นด่านพื้นฐานเท่านั้น ด่านหลักบน Production = Vercel Firewall Rate Limiting + rate limit ของ Supabase Auth (ดู docs/deploy-vercel.md)
export function rateLimit(name: string, limitPerMinute: number): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;

  return (req, res, next) => {
    const now = Date.now();
    if (now >= nextSweep) {
      // ลบ IP ที่หมดรอบแล้ว ไม่ให้ Map โตไปเรื่อย ๆ
      for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
      nextSweep = now + WINDOW_MS;
    }

    const ip = req.ip ?? "unknown";
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      hits.set(ip, entry);
    }
    entry.count += 1;

    if (entry.count > limitPerMinute) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      throw new ApiError(429, `ส่งคำขอ${name}ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่`);
    }
    next();
  };
}
