import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "./error.js";

const WINDOW_MS = 60_000;

interface Hit {
  count: number;
  resetAt: number;
}

// ที่เก็บตัวนับ: hit() = นับเพิ่ม 1 แล้วคืนยอดของรอบปัจจุบัน
export interface RateLimitStore {
  hit(key: string, now: number): Promise<Hit>;
}

// ในหน่วยความจำของ process — ใช้ได้เฉพาะเครื่อง dev / เทสต์ ที่มี process เดียว
// (บน Vercel มีหลาย instance และ instance ถูกสร้างใหม่ได้ตลอด ตัวนับจะไม่รวมกัน → env.ts บังคับใช้ Redis)
export function memoryStore(): RateLimitStore {
  const hits = new Map<string, Hit>();
  let nextSweep = 0;
  return {
    async hit(key, now) {
      if (now >= nextSweep) {
        // ลบ key ที่หมดรอบแล้ว ไม่ให้ Map โตไปเรื่อย ๆ
        for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
        nextSweep = now + WINDOW_MS;
      }
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        hits.set(key, entry);
      }
      entry.count += 1;
      return { ...entry };
    },
  };
}

// Upstash Redis ผ่าน REST API (fixed window ต่อนาที) — ตัวนับเดียวกันทุก instance ของ Vercel
// ใช้ fetch ตรง ๆ ไม่ต้องเพิ่ม dependency · INCR + PEXPIRE ส่งรวดเดียวด้วย /pipeline
export function upstashStore(url: string, token: string, fetchImpl: typeof fetch = fetch): RateLimitStore {
  const endpoint = `${url.replace(/\/+$/, "")}/pipeline`;
  return {
    async hit(key, now) {
      const windowStart = now - (now % WINDOW_MS);
      const redisKey = `pawhome:rl:${key}:${windowStart}`;
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["PEXPIRE", redisKey, String(WINDOW_MS * 2)],
        ]),
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok) throw new Error(`upstash HTTP ${res.status}`);
      const [incr] = (await res.json()) as { result?: unknown; error?: string }[];
      if (typeof incr?.result !== "number") throw new Error(`upstash: ${incr?.error ?? "unexpected response"}`);
      return { count: incr.result, resetAt: windowStart + WINDOW_MS };
    },
  };
}

const sharedStore = (): RateLimitStore =>
  env.REDIS_REST_URL && env.REDIS_REST_TOKEN ? upstashStore(env.REDIS_REST_URL, env.REDIS_REST_TOKEN) : memoryStore();

// จำกัดจำนวนครั้งต่อ IP ต่อนาที แยกตาม name — เกินแล้วตอบ 429 + Retry-After
// IP มาจาก req.ip ซึ่งเชื่อ X-Forwarded-For เฉพาะเมื่อตั้ง TRUST_PROXY (app.ts) ไม่งั้นปลอม header ข้าม limit ได้
// Redis ล่ม/ช้าเกิน 2 วินาที → ปล่อยผ่าน (fail-open) และ log ไว้ — Supabase Auth ยังมี rate limit ของตัวเองอีกชั้น
export function rateLimit(name: string, limitPerMinute: number, store: RateLimitStore = sharedStore()): RequestHandler {
  const prefix = encodeURIComponent(name);
  return async (req, res, next) => {
    const now = Date.now();
    let hit: Hit;
    try {
      hit = await store.hit(`${prefix}:${req.ip ?? "unknown"}`, now);
    } catch (err) {
      console.error("rate limit store:", err instanceof Error ? err.message : err);
      next();
      return;
    }
    if (hit.count > limitPerMinute) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((hit.resetAt - now) / 1000)));
      throw new ApiError(429, `ส่งคำขอ${name}ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่`);
    }
    next();
  };
}
