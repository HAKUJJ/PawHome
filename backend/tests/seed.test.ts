// ชุดข้อมูลทดสอบ database/seeds/* บน PostgreSQL จริง (PGlite): รันสองรอบ + verification + cleanup + guard
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_DATASET_USERS } from "../scripts/demo-dataset.js";
import { checkSeedEnvironment } from "../scripts/seed-demo-users.js";
import { MIGRATIONS } from "./global-setup.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = JSON.parse(read("../../database/seeds/manifest.json")) as { runOrder: string[]; cleanup: string; expected: Record<string, unknown> };
type Check = { check_name: string; expected: string; actual: string; ok: boolean };

async function migratedDb({ withDemoUsers = true } = {}) {
  const db = await PGlite.create();
  await db.exec(read("./supabase-stub.sql"));
  await db.exec(read("../../database/schema.sql"));
  for (const file of MIGRATIONS) await db.exec(read(file));
  // บน Supabase จริงขั้นนี้คือ `npm run seed:demo-users` (Admin API) — ในเทสต์ใส่ลงตาราง auth จำลอง
  if (withDemoUsers) {
    for (const u of DEMO_DATASET_USERS) {
      await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [u.email, { name: u.name }]);
    }
  }
  return db;
}
const seed = async (db: PGlite) => { for (const file of manifest.runOrder) await db.exec(read(`../../database/seeds/${file}`)); };
const verify = async (db: PGlite, file: string) => (await db.exec(read(`../../database/verification/${file}`))).at(-1)!.rows as Check[];

const TABLES = ["profiles", "pets", "favorites", "adoption_requests", "adoption_stage_history", "adoption_handover_reports",
  "adoption_follow_ups", "announcements", "notification_events", "admin_audit_logs", "admin_memberships", "user_suspensions"];
async function counts(db: PGlite) {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = (await db.query<{ n: number }>(`select count(*)::int n from public.${t}`)).rows[0].n;
  return out;
}

describe("demo dataset seed", async () => {
  const db = await migratedDb();
  await seed(db);
  const first = await counts(db);
  await seed(db); // รอบสอง: ต้องไม่เพิ่มแถว
  const second = await counts(db);

  it("is idempotent: the second run adds no rows", () => {
    expect(second).toEqual(first);
  });

  it("creates the dataset described in manifest.json", () => {
    const e = manifest.expected as { pets: number; requests: number; favorites: number; announcements: number; notifications: number; auditLogs: number; timelineEvents: number };
    expect(first.pets).toBe(e.pets);
    expect(first.adoption_requests).toBe(e.requests);
    expect(first.favorites).toBe(e.favorites);
    expect(first.announcements).toBe(e.announcements);
    expect(first.notification_events).toBe(e.notifications);
    expect(first.admin_audit_logs).toBe(e.auditLogs);
    expect(first.adoption_stage_history).toBe(e.timelineEvents);
    expect(first.profiles).toBe(DEMO_DATASET_USERS.length);
  });

  for (const file of ["verify-demo-data.sql", "verify-adoption-workflow.sql", "verify-rls.sql", "verify-admin.sql"]) {
    it(`${file}: every check passes`, async () => {
      const rows = await verify(db, file);
      expect(rows.length).toBeGreaterThan(10);
      expect(rows.filter((r) => !r.ok)).toEqual([]);
    });
  }

  it("cleanup removes only this dataset (audit log stays, append-only) and the seed can run again", async () => {
    // ข้อมูลที่ไม่ใช่ของชุดนี้ต้องไม่ถูกลบ
    await db.exec(`insert into public.announcements (title, status) values ('ประกาศอื่นที่ไม่ใช่ชุดทดสอบ', 'DRAFT')`);
    await db.exec(read("../../database/seeds/999-cleanup-demo.sql"));
    const after = await counts(db);
    expect(after).toMatchObject({ pets: 0, adoption_requests: 0, favorites: 0, adoption_stage_history: 0, notification_events: 0, admin_memberships: 0, user_suspensions: 0, announcements: 1 });
    expect(after.admin_audit_logs).toBe(first.admin_audit_logs);
    expect(after.profiles).toBe(first.profiles); // บัญชีลบผ่าน Supabase Auth เท่านั้น
    await seed(db);
    expect((await counts(db)).adoption_requests).toBe(first.adoption_requests);
    expect((await verify(db, "verify-adoption-workflow.sql")).filter((r) => !r.ok)).toEqual([]);
  });
});

describe("seed-demo-users environment guard (Supabase Auth accounts)", () => {
  const ok = { SEED_TARGET: "development", SUPABASE_URL: "https://devproject.supabase.co", SEED_ALLOWED_PROJECT_REFS: "devproject", DEMO_USER_PASSWORD: "a-long-test-password" };
  it("accepts only an explicitly allowed Development project", () => {
    expect(checkSeedEnvironment(ok)).toEqual({ projectRef: "devproject", password: "a-long-test-password" });
  });
  it.each([
    ["no SEED_TARGET", { ...ok, SEED_TARGET: undefined }, /SEED_TARGET/],
    ["project not allow-listed (e.g. Production)", { ...ok, SUPABASE_URL: "https://prodproject.supabase.co" }, /ไม่อยู่ใน SEED_ALLOWED_PROJECT_REFS/],
    ["empty allow-list", { ...ok, SEED_ALLOWED_PROJECT_REFS: "" }, /SEED_ALLOWED_PROJECT_REFS/],
    ["running on Vercel", { ...ok, VERCEL: "1" }, /Vercel/],
    ["short password", { ...ok, DEMO_USER_PASSWORD: "123456" }, /DEMO_USER_PASSWORD/],
  ])("refuses: %s", (_name, env, message) => {
    expect(() => checkSeedEnvironment(env as NodeJS.ProcessEnv)).toThrow(message);
  });
  it("never echoes the password in errors", () => {
    try { checkSeedEnvironment({ ...ok, SEED_TARGET: "production" }); } catch (error) { expect(String(error)).not.toContain(ok.DEMO_USER_PASSWORD); }
  });
});

describe("seed guards", () => {
  it("refuses when demo auth accounts are missing", async () => {
    const db = await migratedDb({ withDemoUsers: false });
    await expect(db.exec(read("../../database/seeds/001-demo-profiles.sql"))).rejects.toThrow(/seed:demo-users/);
    await db.close();
  });

  it("refuses on a database that contains real users' data (Production protection)", async () => {
    const db = await migratedDb();
    await db.exec(`
      insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000cc', 'real.person@example.com');
      insert into public.pets (owner_id, name, species, age_months, sex, province, description)
      values ('00000000-0000-4000-8000-0000000000cc', 'น้องจริง', 'DOG', 3, 'MALE', 'ภูเก็ต', 'โพสต์ของผู้ใช้จริง');
    `);
    for (const file of manifest.runOrder) {
      await expect(db.exec(read(`../../database/seeds/${file}`))).rejects.toThrow(/ข้อมูลของผู้ใช้จริง/);
    }
    const pets = await db.query<{ n: number }>("select count(*)::int n from public.pets");
    expect(pets.rows[0].n).toBe(1);
    await db.close();
  });

  it("later files refuse to run before the pets file (time anchor)", async () => {
    const db = await migratedDb();
    await db.exec(read("../../database/seeds/001-demo-profiles.sql"));
    await expect(db.exec(read("../../database/seeds/004-demo-adoptions.sql"))).rejects.toThrow(/002-demo-pets/);
    await db.close();
  });
});
