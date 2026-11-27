import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { DEMO_USERS } from "./demo-users.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// ฐานข้อมูลแยก ไม่กระทบตัวที่ api.test ใช้
async function freshDb() {
  const db = await PGlite.create();
  await db.exec(read("./supabase-stub.sql"));
  await db.exec(read("../../database/schema.sql"));
  return db;
}

describe("schema.sql trigger", () => {
  it("creates a profile even without name or email (phone sign-up)", async () => {
    const db = await freshDb();
    await db.query("insert into auth.users (id, email) values ($1, null)", ["00000000-0000-4000-8000-0000000000aa"]);
    const { rows } = await db.query<{ name: string }>("select name from public.profiles");
    expect(rows).toEqual([{ name: "ผู้ใช้" }]);
    await db.close();
  });
});

describe("mock-data.sql safety", () => {
  it("refuses to run when demo users are missing", async () => {
    const db = await freshDb();
    await expect(db.exec(read("../../database/mock-data.sql"))).rejects.toThrow(/seed:users/);
    await db.close();
  });

  it("refuses to run on a database that has real users' pets", async () => {
    const db = await freshDb();
    for (const u of DEMO_USERS) {
      await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
    }
    await db.exec(`
      insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000bb', 'real@gmail.com');
      insert into public.pets (owner_id, name, species, age_months, sex, province, description)
      values ('00000000-0000-4000-8000-0000000000bb', 'จริง', 'DOG', 3, 'MALE', 'ภูเก็ต', 'โพสต์ของผู้ใช้จริง');
    `);
    await expect(db.exec(read("../../database/mock-data.sql"))).rejects.toThrow(/ข้อมูลของผู้ใช้จริง/);
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from public.pets");
    expect(rows[0].n).toBe(1); // ไม่ได้ใส่อะไรเพิ่ม
    await db.close();
  });
});

// ผลของ database/verification/verify.sql ที่รันใน global-setup (หลัง schema.sql + migrations + mock-data.sql)
describe("database/verification/verify.sql", () => {
  const rows = inject("verifyRows");

  it("has checks", () => {
    expect(rows.length).toBeGreaterThan(30);
  });

  it.each(rows.map((r) => [r.check_name, r] as const))("%s", (_name, row) => {
    expect(row.actual).toBe(row.expected);
  });
});

describe("database/verification/verify-admin.sql", () => {
  const rows = inject("verifyAdminRows");

  it("has checks", () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  it.each(rows.map((r) => [r.check_name, r] as const))("%s", (_name, row) => {
    expect(row.actual).toBe(row.expected);
  });
});

// ฐานข้อมูลที่มีข้อมูลระบบเดิมอยู่แล้ว (ก่อน migration) → รัน migration → ตรวจการ map และย้อนกลับ
describe("migration 001 on legacy data", () => {
  const migration = read("../../database/migrations/001_admin_workflow.sql");
  const rollback = read("../../database/migrations/001_admin_workflow.rollback.sql");

  async function legacyDb() {
    const db = await freshDb();
    for (const u of DEMO_USERS) await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
    await db.exec(read("../../database/mock-data.sql"));
    // ระบบเดิม: อนุมัติคำขอ #2 → น้อง #4 ADOPTED · มีคำขอที่ไม่ผ่าน 1 รายการ
    await db.exec(`
      update public.adoption_requests set status = 'APPROVED', updated_at = now() - interval '5 days' where id = 2;
      update public.pets set status = 'ADOPTED' where id = 4;
      insert into public.adoption_requests (pet_id, user_id, phone, housing, message, status)
      values (5, '${DEMO_USERS[2].id}', '0811111111', 'HOUSE', 'คำขอจากระบบเดิม', 'REJECTED');
    `);
    return db;
  }

  type Row = { id: number; status: string; stage: string; legacy_review: boolean; follow_up_required: boolean; idle_from_created: boolean };
  const requests = async (db: PGlite) =>
    (await db.query<Row>(`select id, status, stage, legacy_review, follow_up_required, last_activity_at = created_at as idle_from_created
                          from public.adoption_requests order by id`)).rows;

  it("maps APPROVED → ACCEPTED + legacy review (never COMPLETED) and keeps the pet ADOPTED", async () => {
    const db = await legacyDb();
    await db.exec(migration);
    await db.exec(migration); // idempotent: ไม่ map ซ้ำ ไม่เพิ่มประวัติซ้ำ
    expect(await requests(db)).toEqual([
      { id: 1, status: "PENDING", stage: "PENDING", legacy_review: false, follow_up_required: false, idle_from_created: true },
      { id: 2, status: "APPROVED", stage: "ACCEPTED", legacy_review: true, follow_up_required: true, idle_from_created: false },
      { id: 3, status: "REJECTED", stage: "REJECTED", legacy_review: false, follow_up_required: false, idle_from_created: false },
    ]);
    const history = await db.query<{ request_id: number; actor_role: string }>(
      "select request_id, actor_role from public.adoption_stage_history order by id");
    expect(history.rows).toEqual([{ request_id: 2, actor_role: "SYSTEM" }, { request_id: 3, actor_role: "SYSTEM" }]);
    const pet = await db.query<{ status: string }>("select status from public.pets where id = 4");
    expect(pet.rows[0].status).toBe("ADOPTED");
    await db.close();
  });

  it("expand/contract: old backend keeps working after 001; 003 maps its writes and then enforces the constraint", async () => {
    const db = await legacyDb();
    await db.exec(migration);
    await db.exec(read("../../database/migrations/002_notifications_announcements.sql"));
    // Backend รุ่นเดิมหลัง 001: อนุมัติคำขอ #1 ด้วยการเขียน status อย่างเดียว → ต้องยังทำได้ (ไม่มี constraint)
    await db.exec("update public.adoption_requests set status = 'APPROVED', updated_at = now() where id = 1");
    const contract = read("../../database/migrations/003_admin_workflow_contract.sql");
    await db.exec(contract);
    await db.exec(contract); // รันซ้ำได้
    expect((await requests(db))[0]).toMatchObject({ id: 1, status: "APPROVED", stage: "ACCEPTED", legacy_review: true });
    const history = await db.query<{ n: number }>("select count(*)::int n from public.adoption_stage_history where request_id = 1");
    expect(history.rows[0].n).toBe(1);
    // หลัง 003: เขียน status อย่างเดียวแบบ Backend เดิมไม่ได้แล้ว
    await expect(db.exec("update public.adoption_requests set status = 'REJECTED' where id = 1")).rejects.toThrow(/stage_status_consistent/);
    await db.close();
  });

  // Backend รุ่นเดิม (commit ปัจจุบันบน Production) เขียนเฉพาะคอลัมน์เดิม: สร้างคำขอ · อนุมัติ/ปฏิเสธด้วย status · ยกเลิก = ลบแถว · โพสต์/ลบน้อง
  const oldBackendWrites = async (db: PGlite) => {
    const pet = (await db.query<{ id: number }>(`insert into public.pets (owner_id, name, species, breed, age_months, sex, province, description)
      values ('${DEMO_USERS[0].id}', 'น้องทดสอบรุ่นเดิม', 'CAT', 'ไทย', 6, 'FEMALE', 'กรุงเทพมหานคร', 'สร้างโดย Backend รุ่นเดิม') returning id`)).rows[0].id;
    const insert = async (applicant: string, status = "PENDING") => (await db.query<{ id: number }>(`insert into public.adoption_requests (pet_id, user_id, phone, housing, message, status)
      values (${pet}, '${applicant}', '0800000000', 'HOUSE', 'คำขอจาก Backend รุ่นเดิม', '${status}') returning id`)).rows[0].id;
    const a = await insert(DEMO_USERS[1].id);
    await db.query("update public.adoption_requests set status = 'REJECTED', updated_at = now() where id = $1", [a]);
    const b = await insert(DEMO_USERS[2].id);
    await db.query("delete from public.adoption_requests where id = $1", [b]);
    const c = await insert(DEMO_USERS[2].id);
    await db.query("update public.adoption_requests set status = 'APPROVED', updated_at = now() where id = $1", [c]);
    await db.query("update public.pets set status = 'ADOPTED' where id = $1", [pet]);
    return { pet, rejected: a, approved: c };
  };

  it("compatibility matrix: old backend on old / expanded schema, rollback of 003 lets the old backend write again", async () => {
    const db = await legacyDb();
    await oldBackendWrites(db); // old backend + old schema
    await db.exec(migration);
    await db.exec(read("../../database/migrations/002_notifications_announcements.sql"));
    const expanded = await oldBackendWrites(db); // old backend + expanded schema (001 + 002)
    await db.exec(read("../../database/migrations/003_admin_workflow_contract.sql"));
    const rows = await db.query<{ id: number; stage: string; legacy_review: boolean }>(
      "select id, stage, legacy_review from public.adoption_requests where id = any($1) order by id", [[expanded.rejected, expanded.approved]]);
    expect(rows.rows).toEqual([
      { id: expanded.rejected, stage: "REJECTED", legacy_review: false },
      { id: expanded.approved, stage: "ACCEPTED", legacy_review: true },
    ]);
    // ไม่มีคำขอใดถูกแปลงเป็น COMPLETED โดยไม่มีหลักฐานส่งมอบ
    expect((await db.query<{ n: number }>("select count(*)::int n from public.adoption_requests where stage = 'COMPLETED'")).rows[0].n).toBe(0);
    // old backend + contracted schema = เขียนไม่ได้ (ต้อง rollback 003 ก่อน rollback Backend)
    await expect(oldBackendWrites(db)).rejects.toThrow(/stage_status_consistent/);
    await db.exec(read("../../database/migrations/003_admin_workflow_contract.rollback.sql"));
    await oldBackendWrites(db);
    await db.close();
  });

  it("locks _prisma_migrations away from anon/authenticated when it exists", async () => {
    const db = await legacyDb();
    await db.exec("create table public._prisma_migrations (id text primary key, migration_name text)");
    const privileged = async () => (await db.query<{ n: number }>(`select count(*)::int n from unnest(array['anon','authenticated']) r
      where has_table_privilege(r, 'public._prisma_migrations', 'SELECT') or has_table_privilege(r, 'public._prisma_migrations', 'DELETE')`)).rows[0].n;
    expect(await privileged()).toBe(2); // Supabase default grants
    await db.exec(migration);
    expect(await privileged()).toBe(0);
    await db.close();
  });

  it("000 locks _prisma_migrations without touching its rows, is idempotent, no-op without the table, and rolls back", async () => {
    const lock = read("../../database/migrations/000_lock_prisma_migrations.sql");
    const unlock = read("../../database/migrations/000_lock_prisma_migrations.rollback.sql");
    const db = await legacyDb();
    await db.exec(lock); // ไม่มีตาราง → ข้ามเงียบ ๆ
    await db.exec(`create table public._prisma_migrations (id varchar(36) primary key, checksum varchar(64) not null, migration_name varchar(255) not null);
      insert into public._prisma_migrations values ('a7d2428e-6d26-4b87-b6bc-8605d1cb28c2', 'abc', '20261127000000_init');`);
    const access = async () => (await db.query<{ n: number }>(`select count(*)::int n from unnest(array['anon','authenticated']) r
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p where has_table_privilege(r, 'public._prisma_migrations', p)`)).rows[0].n;
    const rows = async () => (await db.query("select * from public._prisma_migrations")).rows;
    const before = await rows();
    expect(await access()).toBe(10);
    await db.exec(lock);
    await db.exec(lock);
    expect(await access()).toBe(0);
    expect(await rows()).toEqual(before);
    // anon ผ่าน PostgREST = role anon: อ่านไม่ได้
    await db.exec("set role anon");
    await expect(db.query("select * from public._prisma_migrations")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    // 001 ทำซ้ำได้หลัง 000 · rollback คืนสิทธิ์เดิม
    await db.exec(migration);
    expect(await access()).toBe(0);
    await db.exec(unlock);
    expect(await access()).toBe(10);
    expect(await rows()).toEqual(before);
    await db.close();
  });

  it("preflight-production.sql: read-only, every blocker passes on legacy data, reports the backfill", async () => {
    const preflight = read("../../database/verification/preflight-production.sql");
    const db = await legacyDb();
    await db.exec("begin read only");
    const rows = (await db.query<{ severity: string; check_name: string; actual: string; ok: boolean }>(preflight)).rows;
    await db.exec("rollback");
    expect(rows.filter((r) => r.severity === "blocker").length).toBeGreaterThanOrEqual(8);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    expect(rows.find((r) => r.check_name.startsWith("migration 001"))?.actual).toBe("false");
    expect(rows.find((r) => r.check_name.startsWith("APPROVED →"))?.actual).toBe("1");
    // ข้อมูลผิดรูปแบบ → blocker ไม่ผ่าน
    await db.exec("alter table public.adoption_requests drop constraint adoption_requests_status_check; update public.adoption_requests set status = 'WEIRD' where id = 1");
    const bad = (await db.query<{ check_name: string; ok: boolean }>(preflight)).rows.filter((r) => !r.ok).map((r) => r.check_name);
    expect(bad).toEqual(["requests with unknown status (not PENDING/APPROVED/REJECTED/CANCELLED)"]);
    await db.close();
  });

  it("rollback restores the legacy shape and the migration can be re-applied", async () => {
    const db = await legacyDb();
    await db.exec(migration);
    await db.exec(rollback);
    const cols = await db.query<{ n: number }>(
      "select count(*)::int n from information_schema.columns where table_name = 'adoption_requests' and column_name = 'stage'");
    expect(cols.rows[0].n).toBe(0);
    expect((await db.query<{ status: string }>("select status from public.adoption_requests order by id")).rows.map((r) => r.status))
      .toEqual(["PENDING", "APPROVED", "REJECTED"]);
    await db.exec(migration);
    expect((await requests(db))[1]).toMatchObject({ stage: "ACCEPTED", legacy_review: true });
    await db.close();
  });
});
