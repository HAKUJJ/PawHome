// ชุดข้อมูลสาธิตขนาดเล็ก database/seeds/minimal/* บน PGlite: รันสองรอบ + ตรวจ + cleanup + guard
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MINIMAL_DATASET_USERS } from "../scripts/demo-dataset.js";
import { MIGRATIONS } from "./global-setup.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const seedSql = read("../../database/seeds/minimal/seed.sql");
type Check = { check_name: string; expected: string; actual: string; ok: boolean };

async function migratedDb(withUsers = true) {
  const db = await PGlite.create();
  await db.exec(read("./supabase-stub.sql"));
  await db.exec(read("../../database/schema.sql"));
  for (const file of MIGRATIONS) await db.exec(read(file));
  // บน Supabase จริงคือ `npm run seed:demo-users -- --dataset minimal` (Admin API)
  if (withUsers) for (const u of MINIMAL_DATASET_USERS) await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2)", [u.email, { name: u.name }]);
  return db;
}
const TABLES = ["profiles", "pets", "favorites", "adoption_requests", "adoption_stage_history", "adoption_handover_reports",
  "adoption_follow_ups", "announcements", "notification_events", "admin_memberships"];
async function counts(db: PGlite) {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = (await db.query<{ n: number }>(`select count(*)::int n from public.${t}`)).rows[0].n;
  return out;
}
const failing = async (db: PGlite, file: string) => ((await db.exec(read(file))).at(-1)!.rows as Check[]).filter((r) => !r.ok);

describe("minimal demo dataset", async () => {
  const db = await migratedDb();
  await db.exec(seedSql);
  const first = await counts(db);
  await db.exec(seedSql);

  it("is idempotent (second run adds nothing — no duplicate notifications or audit events)", async () => {
    expect(await counts(db)).toEqual(first);
  });

  it("creates the small dataset", () => {
    expect(first).toMatchObject({ profiles: 6, pets: 10, adoption_requests: 12, favorites: 8, adoption_stage_history: 36, adoption_handover_reports: 6,
      adoption_follow_ups: 4, announcements: 3, notification_events: 16, admin_memberships: 1 });
  });

  it("minimal/verify.sql: every check passes (counts, 10 scenarios, pet status, FK, RBAC)", async () => {
    expect(await failing(db, "../../database/seeds/minimal/verify.sql")).toEqual([]);
  });

  it("verify-adoption-workflow.sql: workflow rules hold", async () => {
    expect(await failing(db, "../../database/verification/verify-adoption-workflow.sql")).toEqual([]);
  });

  it("cleanup removes only this dataset and the seed can run again", async () => {
    await db.exec(`insert into public.announcements (title) values ('ประกาศอื่นที่ไม่ใช่เดโม่')`);
    await db.exec(read("../../database/seeds/minimal/cleanup.sql"));
    expect(await counts(db)).toMatchObject({ pets: 0, adoption_requests: 0, notification_events: 0, announcements: 1, admin_memberships: 0 });
    await db.exec(seedSql);
    expect(await failing(db, "../../database/seeds/minimal/verify.sql")).toEqual([]);
  });

  it("works next to the large dataset id ranges (no overlap)", () => {
    // ช่วง id ของชุดเล็ก (2201–2210, 3501–3512, 601–603, 96xxxx) ไม่ทับชุดใหญ่ (2001–2100, 3001–3999?) — คำขอชุดใหญ่จริงใช้ถึง 3180
    const large = JSON.parse(read("../../database/seeds/manifest.json")) as { expected: { requests: number } };
    expect(3000 + large.expected.requests).toBeLessThan(3501);
  });
});

describe("minimal seed guards", () => {
  it("refuses without the 6 demo accounts", async () => {
    const db = await migratedDb(false);
    await expect(db.exec(seedSql)).rejects.toThrow(/mini-01…06/);
    await db.close();
  });

  it("refuses on a database with real users' data", async () => {
    const db = await migratedDb();
    await db.exec(`
      insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000dd', 'someone@example.com');
      insert into public.pets (owner_id, name, species, age_months, sex, province, description)
      values ('00000000-0000-4000-8000-0000000000dd', 'น้องจริง', 'CAT', 5, 'FEMALE', 'ตรัง', 'โพสต์ของผู้ใช้จริง');
    `);
    await expect(db.exec(seedSql)).rejects.toThrow(/ข้อมูลของผู้ใช้จริง/);
    await db.exec("rollback"); // seed อยู่ใน transaction เดียว: guard ทำให้ทั้งก้อนถูกยกเลิก (SQL client ทำ rollback ให้เอง)
    expect((await db.query<{ n: number }>("select count(*)::int n from public.pets")).rows[0].n).toBe(1);
    await db.close();
  });
});
