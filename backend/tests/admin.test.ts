// Admin API + RBAC + ความปลอดภัย (โหมดเดิม: ADOPTION_HANDOVER_WORKFLOW=false)
// ใช้ฐานข้อมูลก้อนแยก (adminDatabaseUrl) ไม่กระทบจำนวนแถวที่ api.test คาดหวัง
import request from "supertest";
import { describe, expect, inject, it, vi } from "vitest";

process.env.DATABASE_URL = inject("adminDatabaseUrl");
delete process.env.ADOPTION_HANDOVER_WORKFLOW;
delete process.env.CRON_SECRET;
vi.mock("../src/config/supabase.js", () => import("./fake-supabase.js"));

const { app } = await import("../src/app.js");
const { registerAccount, tokenFor } = await import("./fake-supabase.js");
const { prisma } = await import("../src/config/prisma.js");

const api = request(app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ---- บัญชี: bootstrap SUPER_ADMIN ทำตรงที่ฐานข้อมูล (เหมือน scripts/grant-admin.ts) ไม่มี endpoint ให้แต่งตั้งตัวเอง ----
const superAdmin = await registerAccount("root@pawhome.test", "หัวหน้าผู้ดูแล");
const admin = await registerAccount("admin@pawhome.test", "ผู้ดูแล");
const alice = await registerAccount("alice@pawhome.test", "อลิซ");
const bob = await registerAccount("bob@pawhome.test", "บ็อบ");
await prisma.adminMembership.createMany({ data: [{ userId: superAdmin.id, role: "SUPER_ADMIN" }, { userId: admin.id, role: "ADMIN" }] });
const shelter = tokenFor("shelter@pawhome.test");
const mind = tokenFor("mind@pawhome.test");

const petBody = {
  name: "ทดสอบผู้ดูแล", species: "DOG", breed: "", ageMonths: 6, sex: "MALE", province: "ภูเก็ต", imageUrl: "",
  description: "โพสต์สำหรับทดสอบระบบผู้ดูแล", vaccinated: false, sterilized: false, urgent: false,
};
const form = { phone: "0811111111", housing: "HOUSE", message: "มีบ้านเดี่ยว มีคนอยู่บ้านตลอด เคยเลี้ยงสุนัขมาก่อน" };

describe("RBAC: who can enter /api/admin", () => {
  it("anonymous → 401 on every admin route", async () => {
    for (const path of ["/api/admin/me", "/api/admin/dashboard", "/api/admin/pets", "/api/admin/audit-logs"]) {
      expect((await api.get(path)).status).toBe(401);
    }
  });

  it("invalid / forged token → 401", async () => {
    expect((await api.get("/api/admin/me").set(auth("forged-token"))).status).toBe(401);
    expect((await api.get("/api/admin/me").set({ Authorization: "Basic abc" })).status).toBe(401);
  });

  it("regular USER → 403 (role comes from the database, not the request)", async () => {
    const res = await api.get("/api/admin/me").set(auth(alice.token)).set("X-Role", "SUPER_ADMIN");
    expect(res.status).toBe(403);
    expect((await api.get("/api/admin/dashboard").set(auth(alice.token))).status).toBe(403);
    expect((await api.post("/api/admin/pets/1/moderation").set(auth(alice.token)).send({ decision: "APPROVE" })).status).toBe(403);
  });

  it("ADMIN → /me returns role and permissions without admins.manage", async () => {
    const res = await api.get("/api/admin/me").set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: admin.id, role: "ADMIN", workflow: { handoverEnabled: false, reminderHours: 24, adminHours: 48, escalationHours: 72 } });
    expect(res.body.permissions).not.toContain("admins.manage");
  });

  it("USER cannot elevate own role", async () => {
    expect((await api.put(`/api/admin/admins/${alice.id}`).set(auth(alice.token)).send({ role: "SUPER_ADMIN" })).status).toBe(403);
    expect(await prisma.adminMembership.findUnique({ where: { userId: alice.id } })).toBeNull();
  });

  it("ADMIN cannot assign SUPER_ADMIN (or any role) — denied attempt is audited", async () => {
    const res = await api.put(`/api/admin/admins/${bob.id}`).set(auth(admin.token)).send({ role: "SUPER_ADMIN" });
    expect(res.status).toBe(403);
    expect(await prisma.adminMembership.findUnique({ where: { userId: bob.id } })).toBeNull();
    const denied = await prisma.adminAuditLog.findFirst({ where: { actorId: admin.id, result: "DENIED" } });
    expect(denied).toMatchObject({ action: "permission.denied" });
  });

  it("SUPER_ADMIN grants/revokes admins but cannot change own role", async () => {
    const granted = await api.put(`/api/admin/admins/${bob.id}`).set(auth(superAdmin.token)).send({ role: "ADMIN" });
    expect(granted.status).toBe(200);
    expect((await api.get("/api/admin/me").set(auth(bob.token))).body.role).toBe("ADMIN");
    expect((await api.put(`/api/admin/admins/${superAdmin.id}`).set(auth(superAdmin.token)).send({ role: "ADMIN" })).status).toBe(400);
    expect((await api.put(`/api/admin/admins/${bob.id}`).set(auth(superAdmin.token)).send({ role: "OWNER" })).status).toBe(400);
    expect((await api.delete(`/api/admin/admins/${bob.id}`).set(auth(superAdmin.token))).status).toBe(204);
    expect((await api.get("/api/admin/me").set(auth(bob.token))).status).toBe(403);
    const list = await api.get("/api/admin/admins").set(auth(superAdmin.token));
    const ids = list.body.map((a: { userId: string }) => a.userId);
    expect(ids).toEqual(expect.arrayContaining([admin.id, superAdmin.id]));
    expect(ids).not.toContain(bob.id);
  });
});

describe("pet moderation + public visibility", () => {
  let petId = 0;

  it("request changes needs a reason; hidden from public, visible to owner", async () => {
    petId = (await api.post("/api/pets").set(auth(shelter)).send(petBody)).body.id;
    expect((await api.post(`/api/admin/pets/${petId}/moderation`).set(auth(admin.token)).send({ decision: "REQUEST_CHANGES" })).status).toBe(400);
    const res = await api.post(`/api/admin/pets/${petId}/moderation`).set(auth(admin.token)).send({ decision: "REQUEST_CHANGES", reason: "รูปไม่ชัด กรุณาเปลี่ยนรูป" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ visibility: "CHANGES_REQUESTED", moderationReason: "รูปไม่ชัด กรุณาเปลี่ยนรูป" });

    expect((await api.get("/api/pets")).body.some((p: { id: number }) => p.id === petId)).toBe(false);
    expect((await api.get(`/api/pets/${petId}`)).status).toBe(404);
    expect((await api.get(`/api/pets/${petId}`).set(auth(mind))).status).toBe(404);
    const own = await api.get(`/api/pets/${petId}`).set(auth(shelter));
    expect(own.status).toBe(200);
    expect(own.body.moderationReason).toBe("รูปไม่ชัด กรุณาเปลี่ยนรูป");
    // ขอรับเลี้ยงโพสต์ที่ซ่อนอยู่ไม่ได้
    expect((await api.post(`/api/pets/${petId}/adoptions`).set(auth(mind)).send(form)).status).toBe(404);
  });

  it("owner edit → REVIEW queue → approve → public again", async () => {
    const edited = await api.put(`/api/pets/${petId}`).set(auth(shelter)).send({ ...petBody, description: "แก้ไขรูปและรายละเอียดแล้ว" });
    expect(edited.body.visibility).toBe("REVIEW");
    const queue = await api.get("/api/admin/pets?visibility=REVIEW").set(auth(admin.token));
    expect(queue.body.items.map((p: { id: number }) => p.id)).toContain(petId);
    const ok = await api.post(`/api/admin/pets/${petId}/moderation`).set(auth(admin.token)).send({ decision: "APPROVE" });
    expect(ok.body).toMatchObject({ visibility: "VISIBLE", moderationReason: "" });
    expect((await api.get(`/api/pets/${petId}`)).status).toBe(200);
  });

  it("hide / show is audited; repeating the same state → 409", async () => {
    expect((await api.patch(`/api/admin/pets/${petId}`).set(auth(admin.token)).send({ visibility: "HIDDEN", reason: "รายงานว่าเป็นสแปม" })).status).toBe(200);
    expect((await api.patch(`/api/admin/pets/${petId}`).set(auth(admin.token)).send({ visibility: "HIDDEN" })).status).toBe(409);
    expect((await api.patch(`/api/admin/pets/${petId}`).set(auth(admin.token)).send({ visibility: "VISIBLE" })).status).toBe(200);
    const logs = await api.get(`/api/admin/audit-logs?targetType=pet&targetId=${petId}`).set(auth(admin.token));
    expect(logs.body.items.map((l: { action: string }) => l.action)).toEqual(["pet.show", "pet.hide", "pet.approve", "pet.request_changes"]);
    expect(logs.body.items[0]).toMatchObject({ actorName: "ผู้ดูแล", result: "SUCCESS" });
  });

  it("public APIs never expose phone numbers or messages", async () => {
    const list = JSON.stringify((await api.get("/api/pets")).body);
    const one = JSON.stringify((await api.get("/api/pets/1")).body);
    for (const body of [list, one]) {
      expect(body).not.toMatch(/phone|0812345678|0898765432|message/);
    }
    expect((await api.get("/api/pets/3/adoptions")).status).toBe(401);
    expect((await api.get("/api/pets/3/adoptions").set(auth(mind))).status).toBe(403);
  });
});

describe("legacy approval (workflow off) → admin review queue", () => {
  let petId = 0;
  let caseId = 0;
  let otherId = 0;

  it("owner approves: pet ADOPTED as before, but request is ACCEPTED + legacy review (never COMPLETED)", async () => {
    petId = (await api.post("/api/pets").set(auth(shelter)).send({ ...petBody, name: "เลกาซี" })).body.id;
    caseId = (await api.post(`/api/pets/${petId}/adoptions`).set(auth(mind)).send(form)).body.id;
    otherId = (await api.post(`/api/pets/${petId}/adoptions`).set(auth(alice.token)).send(form)).body.id;
    const res = await api.patch(`/api/adoptions/${caseId}`).set(auth(shelter)).send({ status: "APPROVED" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "APPROVED", stage: "ACCEPTED", pet: { status: "ADOPTED" } });
    const other = await prisma.adoptionRequest.findUniqueOrThrow({ where: { id: otherId } });
    expect(other).toMatchObject({ status: "REJECTED", stage: "REJECTED" });

    const detail = await api.get(`/api/admin/adoptions/${caseId}`).set(auth(admin.token));
    expect(detail.body).toMatchObject({ stage: "ACCEPTED", legacyReview: true, phone: "0811111111", followUp: { priority: "high", required: true } });
    const queue = await api.get("/api/admin/adoptions?queue=legacy").set(auth(admin.token));
    expect(queue.body.items.map((c: { id: number }) => c.id)).toContain(caseId);
  });

  it("participants cannot continue a legacy case until an admin decides", async () => {
    expect((await api.post(`/api/adoptions/${caseId}/arrange`).set(auth(shelter))).status).toBe(404); // workflow ปิด
  });

  it("admin contact note does not reset the owner's activity clock", async () => {
    const before = (await prisma.adoptionRequest.findUniqueOrThrow({ where: { id: caseId } })).lastActivityAt;
    expect((await api.post(`/api/admin/adoptions/${caseId}/follow-ups`).set(auth(admin.token)).send({ kind: "CONTACT" })).status).toBe(400);
    const res = await api.post(`/api/admin/adoptions/${caseId}/follow-ups`).set(auth(admin.token)).send({ kind: "CONTACT", note: "โทรหาเจ้าของแล้ว ยังไม่ได้ส่งมอบ" });
    expect(res.status).toBe(201);
    expect((await prisma.adoptionRequest.findUniqueOrThrow({ where: { id: caseId } })).lastActivityAt).toEqual(before);
    // ข้อมูลระบบเดิมปิดธงเฉย ๆ ไม่ได้ ต้องตรวจผลส่งมอบ
    expect((await api.post(`/api/admin/adoptions/${caseId}/follow-ups`).set(auth(admin.token)).send({ kind: "RESOLVE" })).status).toBe(409);
  });

  it("review-handover requires a reason; REOPEN puts the pet back to PENDING", async () => {
    expect((await api.post(`/api/admin/adoptions/${caseId}/review-handover`).set(auth(admin.token)).send({ decision: "REOPEN" })).status).toBe(400);
    const res = await api.post(`/api/admin/adoptions/${caseId}/review-handover`).set(auth(admin.token)).send({ decision: "REOPEN", note: "เจ้าของยืนยันว่ายังไม่ได้ส่งมอบ" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stage: "ACCEPTED", legacyReview: false });
    expect((await prisma.pet.findUniqueOrThrow({ where: { id: petId } })).status).toBe("PENDING");
  });

  it("COMPLETE on another legacy case with evidence → COMPLETED + verified, pet ADOPTED", async () => {
    const pet2 = (await api.post("/api/pets").set(auth(shelter)).send({ ...petBody, name: "เลกาซีสอง" })).body.id;
    const id = (await api.post(`/api/pets/${pet2}/adoptions`).set(auth(mind)).send(form)).body.id;
    await api.patch(`/api/adoptions/${id}`).set(auth(shelter)).send({ status: "APPROVED" });
    const res = await api.post(`/api/admin/adoptions/${id}/review-handover`).set(auth(admin.token))
      .send({ decision: "COMPLETE", note: "โทรยืนยันทั้งสองฝ่าย ส่งมอบแล้ว 20 พ.ย." });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stage: "COMPLETED", legacyReview: false, resolution: "โทรยืนยันทั้งสองฝ่าย ส่งมอบแล้ว 20 พ.ย." });
    expect(res.body.verifiedAt).toBeTruthy();
    expect((await prisma.pet.findUniqueOrThrow({ where: { id: pet2 } })).status).toBe("ADOPTED");
    // ปิดเคสได้ครั้งเดียว · ปิดแล้วทำอะไรต่อไม่ได้
    expect((await api.post(`/api/admin/adoptions/${id}/close`).set(auth(admin.token)).send({})).status).toBe(200);
    expect((await api.post(`/api/admin/adoptions/${id}/close`).set(auth(admin.token)).send({})).status).toBe(409);
    expect((await api.post(`/api/admin/adoptions/${id}/follow-ups`).set(auth(admin.token)).send({ kind: "FLAG" })).status).toBe(409);
  });

  it("timeline merges stage history and admin notes in order", async () => {
    const res = await api.get(`/api/admin/adoptions/${caseId}/timeline`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.map((e: { label: string }) => e.label)).toEqual([
      "ส่งคำขอรับเลี้ยง",
      "เจ้าของอนุมัติ (ระบบเดิม) · รอผู้ดูแลยืนยันการส่งมอบ",
      "บันทึกการติดต่อ",
      "ผู้ดูแลตรวจแล้ว: ยังไม่ได้ส่งมอบจริง · ให้ดำเนินการส่งมอบต่อ",
      "เปิดเคสให้ดำเนินการต่อ",
    ]);
  });
});

describe("users + suspension", () => {
  it("suspended user is blocked everywhere; admins cannot be suspended", async () => {
    expect((await api.post(`/api/admin/users/${alice.id}/suspension`).set(auth(admin.token)).send({ reason: "" })).status).toBe(400);
    const res = await api.post(`/api/admin/users/${alice.id}/suspension`).set(auth(admin.token)).send({ reason: "โพสต์ขายสัตว์ผิดนโยบาย" });
    expect(res.body).toMatchObject({ suspended: true, suspendedReason: "โพสต์ขายสัตว์ผิดนโยบาย" });
    expect((await api.get("/api/me/pets").set(auth(alice.token))).status).toBe(403);
    expect((await api.post(`/api/admin/users/${superAdmin.id}/suspension`).set(auth(admin.token)).send({ reason: "ทดสอบระงับผู้ดูแล" })).status).toBe(403);
    expect((await api.post(`/api/admin/users/${admin.id}/suspension`).set(auth(admin.token)).send({ reason: "ระงับตัวเองทดสอบ" })).status).toBe(400);

    const suspended = await api.get("/api/admin/users?status=suspended").set(auth(admin.token));
    expect(suspended.body.items.map((u: { id: string }) => u.id)).toEqual([alice.id]);
    expect((await api.delete(`/api/admin/users/${alice.id}/suspension`).set(auth(admin.token))).status).toBe(200);
    expect((await api.get("/api/me/pets").set(auth(alice.token))).status).toBe(200);
  });

  it("user detail + filters", async () => {
    expect((await api.get("/api/admin/users/not-a-uuid").set(auth(admin.token))).status).toBe(404);
    const detail = await api.get(`/api/admin/users/${alice.id}`).set(auth(admin.token));
    expect(detail.body).toMatchObject({ id: alice.id, role: "USER", suspended: false });
    const admins = await api.get("/api/admin/users?role=SUPER_ADMIN").set(auth(admin.token));
    expect(admins.body.items.map((u: { id: string }) => u.id)).toEqual([superAdmin.id]);
  });
});

describe("announcements", () => {
  let id = 0;

  it("validates destination and image ownership", async () => {
    const bad = await api.post("/api/admin/announcements").set(auth(admin.token)).send({ title: "ลิงก์นอก", destination: "https://evil.example" });
    expect(bad.status).toBe(400);
    const js = await api.post("/api/admin/announcements").set(auth(admin.token)).send({ title: "สคริปต์", destination: "javascript:alert(1)" });
    expect(js.status).toBe(400);
    const foreignImage = await api.post("/api/admin/announcements").set(auth(admin.token))
      .send({ title: "รูปคนอื่น", imageUrl: `https://storage.test/pet-images/${alice.id}/x.jpg` });
    expect(foreignImage.status).toBe(400);
    const ownImage = `https://storage.test/pet-images/${admin.id}/0b8f1c1e-1111-4222-8333-944455556666.jpg`;
    const ok = await api.post("/api/admin/announcements").set(auth(admin.token))
      .send({ title: "ตลาดนัดรับเลี้ยง", category: "กิจกรรม", destination: "/pets", imageUrl: ownImage, isDemo: true });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: "DRAFT", isDemo: true, publishedAt: null });
    id = ok.body.id;
  });

  it("draft is not public; publish → public; published cannot be deleted", async () => {
    const publicIds = async () => (await api.get("/api/announcements")).body.map((a: { id: number }) => a.id);
    expect(await publicIds()).not.toContain(id);
    const pub = await api.patch(`/api/admin/announcements/${id}`).set(auth(admin.token)).send({ status: "PUBLISHED", displayOrder: 2 });
    expect(pub.body).toMatchObject({ status: "PUBLISHED", displayOrder: 2, category: "กิจกรรม" }); // ฟิลด์ที่ไม่ได้ส่งไม่ถูกเขียนทับ
    expect(pub.body.publishedAt).toBeTruthy();
    expect(await publicIds()).toContain(id);
    expect((await api.delete(`/api/admin/announcements/${id}`).set(auth(admin.token))).status).toBe(409);
    expect((await api.patch(`/api/admin/announcements/${id}`).set(auth(admin.token)).send({})).status).toBe(400);
    await api.patch(`/api/admin/announcements/${id}`).set(auth(admin.token)).send({ status: "DRAFT" });
    expect((await api.delete(`/api/admin/announcements/${id}`).set(auth(admin.token))).status).toBe(204);
    const actions = (await api.get(`/api/admin/audit-logs?targetType=announcement&targetId=${id}`).set(auth(admin.token))).body.items.map((l: { action: string }) => l.action);
    expect(actions).toEqual(["announcement.delete", "announcement.unpublish", "announcement.publish", "announcement.create"]);
  });

  it("USER cannot manage announcements", async () => {
    expect((await api.post("/api/admin/announcements").set(auth(alice.token)).send({ title: "ปลอม" })).status).toBe(403);
  });
});

describe("dashboard, reports, audit protection, cron", () => {
  it("dashboard counts come from the database", async () => {
    const res = await api.get("/api/admin/dashboard").set(auth(admin.token));
    expect(res.status).toBe(200);
    const total = await prisma.adoptionRequest.count();
    expect(Object.values(res.body.stages as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(total);
    expect(res.body.stages.COMPLETED).toBe(await prisma.adoptionRequest.count({ where: { stage: "COMPLETED" } }));
    expect(res.body.recentAudit).toHaveLength(5);
  });

  it("reports: range validation + counts", async () => {
    expect((await api.get("/api/admin/reports?from=2026-13-01").set(auth(admin.token))).status).toBe(400);
    expect((await api.get("/api/admin/reports?from=2026-12-01&to=2026-11-01").set(auth(admin.token))).status).toBe(400);
    const res = await api.get("/api/admin/reports").set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.requests.completed).toBeGreaterThanOrEqual(1);
    expect(res.body.pets.created).toBeGreaterThanOrEqual(3);
  });

  it("audit logs: read-only API, no secrets, append-only in the database", async () => {
    expect((await api.delete("/api/admin/audit-logs").set(auth(superAdmin.token))).status).toBe(404);
    expect((await api.patch("/api/admin/audit-logs/1").set(auth(superAdmin.token)).send({})).status).toBe(404);
    expect((await api.get("/api/admin/audit-logs").set(auth(alice.token))).status).toBe(403);
    const all = JSON.stringify((await api.get("/api/admin/audit-logs?limit=200").set(auth(superAdmin.token))).body);
    expect(all).not.toMatch(/token-|refresh-|Bearer|password/);
    await expect(prisma.$executeRaw`update public.admin_audit_logs set reason = 'แก้'`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`delete from public.admin_audit_logs`).rejects.toThrow(/append-only/);
  });

  it("cron endpoint is disabled without CRON_SECRET", async () => {
    expect((await api.get("/api/internal/cron/follow-ups")).status).toBe(503);
  });
});
