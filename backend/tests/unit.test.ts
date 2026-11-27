import { describe, expect, it } from "vitest";
import express from "express";
import { envSchema, normalizeEnv, supabaseUrlSchema, trustProxySchema } from "../src/config/env.js";
import { derivePetStatus } from "../src/services/adoptions.service.js";
import { detectImageType } from "../src/services/uploads.service.js";
import { adoptionInputSchema } from "../src/validators/adoptions.validator.js";
import { petFiltersSchema, petInputSchema } from "../src/validators/pets.validator.js";

describe("SUPABASE_URL validation", () => {
  it.each([
    "https://xlbjxpsaciesbtpnxelw.supabase.co",
    "https://xlbjxpsaciesbtpnxelw.supabase.co/",
    "http://localhost:54321",
    "http://127.0.0.1:54321",
  ])("accepts %s", (url) => {
    expect(supabaseUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    ["https://xlbjxpsaciesbtpnxelw.supabase.co/rest/v1/", /ตัด "\/rest\/v1\/" ออก/],
    ["https://abc.supabase.co?x=1", /Project URL อย่างเดียว/],
    ["https://abc.supabase.co/#top", /Project URL อย่างเดียว/],
    ["http://abc.supabase.co", /ต้องเป็น https/],
    ["abc.supabase.co", /ไม่ใช่ URL/],
  ])("rejects %s with a clear message", (url, message) => {
    const result = supabaseUrlSchema.safeParse(url);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message).join(" ")).toMatch(message);
  });
});

describe("derivePetStatus", () => {
  const r = (stage: string, legacyReview = false) => ({ stage, legacyReview });
  it.each([
    [[], "AVAILABLE"],
    [[r("REJECTED"), r("CANCELLED")], "AVAILABLE"],
    [[r("PENDING"), r("REJECTED")], "PENDING"],
    // ตอบรับแล้ว / กำลังส่งมอบ ≠ ได้บ้านแล้ว
    [[r("ACCEPTED")], "PENDING"],
    [[r("ARRANGING_HANDOVER")], "PENDING"],
    [[r("HANDOVER_REPORTED")], "PENDING"],
    [[r("COMPLETED"), r("REJECTED")], "ADOPTED"],
    // อนุมัติจากระบบเดิม (ยังไม่ตรวจ) คงสถานะได้บ้านแล้วไว้ก่อน
    [[r("ACCEPTED", true)], "ADOPTED"],
  ] as const)("%j → %s", (requests, expected) => {
    expect(derivePetStatus([...requests])).toBe(expected);
  });
});

describe("detectImageType", () => {
  it("reads magic bytes, not the file name", () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(detectImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("validators", () => {
  const pet = {
    name: "ข้าวตัง",
    species: "DOG",
    breed: "พันทาง",
    ageMonths: 24,
    sex: "MALE",
    province: "กรุงเทพมหานคร",
    imageUrl: "",
    description: "ขี้อ้อน ชอบเดินเล่นตอนเย็น ขับถ่ายเป็นที่แล้ว",
    vaccinated: true,
    sterilized: true,
    urgent: true,
  };

  it("accepts the same pet the frontend form sends", () => {
    expect(petInputSchema.parse(pet)).toEqual(pet);
  });

  it.each([
    [{ name: "ก" }, "กรุณากรอกชื่อน้องอย่างน้อย 2 ตัวอักษร"],
    [{ ageMonths: 301 }, "อายุต้องเป็นตัวเลข 0–300 เดือน"],
    [{ ageMonths: 1.5 }, "อายุต้องเป็นตัวเลข 0–300 เดือน"],
    [{ description: "สั้นไป" }, "เล่าเรื่องน้องอย่างน้อย 20 ตัวอักษร"],
    [{ province: "" }, "กรุณาเลือกจังหวัด"],
    [{ imageUrl: "javascript:alert(1)" }, "ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://"],
    [{ species: "BIRD" }, "ชนิดสัตว์ไม่ถูกต้อง"],
  ])("rejects %j", (patch, message) => {
    const result = petInputSchema.safeParse({ ...pet, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("parses GET /pets query strings", () => {
    expect(petFiltersSchema.parse({ urgent: "true", postedWithin: "7", species: "CAT" })).toEqual({
      urgent: true,
      postedWithin: 7,
      species: "CAT",
    });
    expect(petFiltersSchema.safeParse({ postedWithin: "3" }).success).toBe(false);
    expect(petFiltersSchema.safeParse({ urgent: "yes" }).success).toBe(false);
  });

  it("normalises phone like the frontend (strips spaces and dashes)", () => {
    const input = { phone: "081-234 5678", housing: "HOUSE", message: "บ้านมีสนามหญ้า มีคนอยู่บ้านตลอดทั้งวัน" };
    expect(adoptionInputSchema.parse(input).phone).toBe("0812345678");
    expect(adoptionInputSchema.safeParse({ ...input, phone: "1234567890" }).success).toBe(false);
  });
});

// Regression: ค่าที่วางใน Vercel Dashboard แบบนี้เคยทำให้ Function พังทั้งตัว (FUNCTION_INVOCATION_FAILED ทุก route)
describe("environment values pasted into a hosting dashboard", () => {
  const required = {
    DATABASE_URL: "postgresql://u:p@h:6543/postgres?pgbouncer=true",
    SUPABASE_URL: "https://abcd.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  };
  const parse = (extra: Record<string, string>) => envSchema.safeParse(normalizeEnv({ ...required, ...extra }));

  it.each([
    ["quoted", '"10"', 10],
    ["single-quoted", "'15'", 15],
    ["trailing comment", "20 # per IP", 20],
    ["whitespace", "  25  ", 25],
    ["empty → default", "", 10],
    ["leading tab (seen in production)", "	30", 30],
  ])("RATE_LIMIT_REGISTER_PER_MINUTE %s", (_label, value, expected) => {
    const result = parse({ RATE_LIMIT_REGISTER_PER_MINUTE: value });
    expect(result.success).toBe(true);
    expect(result.data?.RATE_LIMIT_REGISTER_PER_MINUTE).toBe(expected);
  });

  it("quoted SUPABASE_URL is accepted", () => {
    expect(parse({ SUPABASE_URL: '"https://abcd.supabase.co"' }).success).toBe(true);
  });

  it("still rejects real garbage and missing required values", () => {
    expect(parse({ RATE_LIMIT_LOGIN_PER_MINUTE: "ten" }).success).toBe(false);
    expect(envSchema.safeParse(normalizeEnv({ ...required, SUPABASE_SERVICE_ROLE_KEY: "  " })).success).toBe(false);
  });

  it("starts without any Redis settings, also on Vercel", () => {
    expect(parse({ VERCEL: "1", TRUST_PROXY: "1" }).success).toBe(true);
  });
});

// Regression: Production เคยตั้ง TRUST_PROXY="ๅ" (กดเลข 1 ตอนแป้นพิมพ์เป็นภาษาไทย)
// → express/proxy-addr โยน "invalid IP address" ตอนโหลด app.ts → FUNCTION_INVOCATION_FAILED ทุก route
describe("TRUST_PROXY validation", () => {
  it.each(["ๅ", "one", "1.2.3", "10.0.0.0/99", "loopback,abc"])("rejects %j with a message naming TRUST_PROXY", (value) => {
    const result = trustProxySchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/TRUST_PROXY/);
  });

  it.each([
    ["1", 1],
    ["true", true],
    ["false", false],
    ["loopback", "loopback"],
    ["10.0.0.0/8, 127.0.0.1", "10.0.0.0/8, 127.0.0.1"],
    ["::1", "::1"],
  ])("accepts %j and Express accepts the result", (value, expected) => {
    const parsed = trustProxySchema.parse(value);
    expect(parsed).toEqual(expected);
    expect(() => express().set("trust proxy", parsed)).not.toThrow();
  });

  it("whole env fails with a clear error instead of crashing later", () => {
    const result = envSchema.safeParse(
      normalizeEnv({
        DATABASE_URL: "postgresql://u:p@h:6543/postgres",
        SUPABASE_URL: "https://abcd.supabase.co",
        SUPABASE_ANON_KEY: "a",
        SUPABASE_SERVICE_ROLE_KEY: "b",
        TRUST_PROXY: "ๅ",
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual(["TRUST_PROXY"]);
  });
});
