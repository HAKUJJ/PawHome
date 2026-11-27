import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import { followUpService } from "../services/follow-up.service.js";

// Vercel Cron เรียก GET พร้อม "Authorization: Bearer <CRON_SECRET>" · ไม่ตั้ง CRON_SECRET = ปิด
function authorized(header: string | undefined): boolean {
  if (!env.CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const cronController = {
  followUps: (async (req, res) => {
    if (!env.CRON_SECRET) throw new ApiError(503, "ยังไม่ได้ตั้งค่า CRON_SECRET");
    if (!authorized(req.headers.authorization)) throw new ApiError(401, "ไม่มีสิทธิ์เรียกงานตามเวลา");
    res.json(await followUpService.sweep());
  }) satisfies RequestHandler,
};
