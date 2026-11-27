// ขั้นตอนรับเลี้ยงแบบส่งมอบจริง (ADOPTION_HANDOVER_WORKFLOW=true) — ทุก transition, สิทธิ์, การแข่งกัน, ข้อพิพาท, cron
// ใช้ฐานข้อมูลก้อนแยก (adminDatabaseUrl) · หมายเหตุ: PGlite มี session เดียว คำสั่งพร้อมกันจึงถูกเรียงคิว
// เทสต์นี้ยืนยันว่าเงื่อนไขแบบ atomic ให้ผลถูก "ไม่ว่าลำดับไหน" — การแข่งกันจริงแบบขนานต้องตรวจซ้ำบน Supabase Development
import request from "supertest";
import { describe, expect, inject, it, vi } from "vitest";

process.env.DATABASE_URL = inject("adminDatabaseUrl");
process.env.ADOPTION_HANDOVER_WORKFLOW = "true";
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef0123";
vi.mock("../src/config/supabase.js", () => import("./fake-supabase.js"));

const { app } = await import("../src/app.js");
const { registerAccount } = await import("./fake-supabase.js");
const { prisma } = await import("../src/config/prisma.js");
const { followUpService } = await import("../src/services/follow-up.service.js");

const api = request(app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const owner = await registerAccount("wf-owner@pawhome.test", "เจ้าของทดสอบ");
const applicant = await registerAccount("wf-applicant@pawhome.test", "ผู้ขอทดสอบ");
const second = await registerAccount("wf-second@pawhome.test", "ผู้ขอคนที่สอง");
const stranger = await registerAccount("wf-stranger@pawhome.test", "คนนอก");
const admin = await registerAccount("wf-admin@pawhome.test", "ผู้ดูแลเวิร์กโฟลว์");
await prisma.adminMembership.create({ data: { userId: admin.id, role: "ADMIN" } });

const form = { phone: "0822222222", housing: "CONDO", message: "คอนโดอนุญาตให้เลี้ยงได้ มีเวลาดูแลทุกวันหลังเลิกงาน" };
let n = 0;
async function newPet() {
  const res = await api.post("/api/pets").set(auth(owner.token)).send({
    name: `น้องเวิร์กโฟลว์ ${++n}`, species: "CAT", breed: "", ageMonths: 4, sex: "FEMALE", province: "ตรัง", imageUrl: "",
    description: "โพสต์สำหรับทดสอบขั้นตอนส่งมอบน้องให้ผู้รับเลี้ยง", vaccinated: true, sterilized: false, urgent: false,
  });
  return res.body.id as number;
}
const apply = async (petId: number, token = applicant.token) => (await api.post(`/api/pets/${petId}/adoptions`).set(auth(token)).send(form)).body.id as number;
const petStatus = async (petId: number) => (await prisma.pet.findUniqueOrThrow({ where: { id: petId } })).status;
const stage = async (id: number) => (await prisma.adoptionRequest.findUniqueOrThrow({ where: { id } })).stage;
const report = (id: number, token: string, handoverDate: string, outcome = "HANDED_OVER") =>
  api.post(`/api/adoptions/${id}/handover-reports`).set(auth(token)).send({ handoverDate, outcome, note: "" });
const accept = (id: number) => api.patch(`/api/adoptions/${id}`).set(auth(owner.token)).send({ status: "APPROVED" });

describe("accept ≠ adopted", () => {
  it("owner accepts → ACCEPTED, pet stays PENDING, other requests keep waiting", async () => {
    const petId = await newPet();
    const a = await apply(petId);
    const b = await apply(petId, second.token);
    const res = await accept(a);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "APPROVED", stage: "ACCEPTED", pet: { status: "PENDING" } });
    expect(await stage(b)).toBe("PENDING");
    // คำขอที่สองตอบรับซ้ำไม่ได้ (หนึ่งน้องตอบรับได้คำขอเดียว)
    const dup = await accept(b);
    expect(dup.status).toBe(409);
    expect(await stage(b)).toBe("PENDING");
  });
});

describe("invalid transitions are rejected", () => {
  it("arrange before accept, report before arrange, confirm without reports", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    expect((await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token))).status).toBe(400);
    expect((await report(id, owner.token, "2026-11-20")).status).toBe(400);
    expect((await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token))).status).toBe(400);
    await accept(id);
    expect((await accept(id)).status).toBe(400); // ตอบรับซ้ำ
    expect((await report(id, owner.token, "2026-11-20")).status).toBe(400);
  });

  it("validates handover report input", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));
    expect((await report(id, owner.token, "20-11-2026")).status).toBe(400);
    expect((await report(id, owner.token, "2999-01-01")).status).toBe(400);
    expect((await report(id, owner.token, "2026-11-20", "MAYBE")).status).toBe(400);
    const foreign = await api.post(`/api/adoptions/${id}/handover-reports`).set(auth(owner.token))
      .send({ handoverDate: "2026-11-20", outcome: "HANDED_OVER", evidenceUrl: `https://storage.test/pet-images/${stranger.id}/a.jpg` });
    expect(foreign.status).toBe(400);
  });
});

describe("unauthorized participants", () => {
  it("only the owner arranges; strangers cannot report, confirm or dispute", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    expect((await api.post(`/api/adoptions/${id}/arrange`).set(auth(applicant.token))).status).toBe(403);
    expect((await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token))).status).toBe(200);
    expect((await report(id, stranger.token, "2026-11-20")).status).toBe(403);
    await report(id, owner.token, "2026-11-20");
    expect((await api.post(`/api/adoptions/${id}/confirm`).set(auth(stranger.token))).status).toBe(403);
    expect((await api.post(`/api/adoptions/${id}/dispute`).set(auth(stranger.token)).send({ note: "ไม่เกี่ยวข้อง" })).status).toBe(403);
    expect((await api.post(`/api/adoptions/${id}/arrange`)).status).toBe(401);
    // ผู้ดูแลตอบรับ/เลือกผู้รับเลี้ยงแทนเจ้าของไม่ได้
    expect((await accept(await apply(await newPet(), second.token)).then(() => api.patch(`/api/adoptions/${id}`).set(auth(admin.token)).send({ status: "APPROVED" }))).status).toBe(403);
  });
});

describe("happy path: matching reports + both confirm → COMPLETED", () => {
  it("one-sided report never adopts; second confirmation completes and closes other requests", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    const other = await apply(petId, second.token);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));

    const first = await report(id, owner.token, "2026-11-20");
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ stage: "HANDOVER_REPORTED", pet: { status: "PENDING" } });
    expect((await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token))).status).toBe(400); // อีกฝ่ายยังไม่รายงาน

    await report(id, applicant.token, "2026-11-20");
    const c1 = await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token));
    expect(c1.body.stage).toBe("HANDOVER_REPORTED");
    expect(await petStatus(petId)).toBe("PENDING");
    expect((await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token))).status).toBe(409); // ยืนยันซ้ำ

    const c2 = await api.post(`/api/adoptions/${id}/confirm`).set(auth(applicant.token));
    expect(c2.body).toMatchObject({ stage: "COMPLETED", status: "APPROVED", pet: { status: "ADOPTED" } });
    expect(await stage(other)).toBe("REJECTED");
    expect((await api.post(`/api/adoptions/${id}/confirm`).set(auth(applicant.token))).status).toBe(400);
    expect((await api.delete(`/api/adoptions/${id}`).set(auth(applicant.token))).status).toBe(400);
  });

  it("a new report clears earlier confirmations", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));
    await report(id, owner.token, "2026-11-21");
    await report(id, applicant.token, "2026-11-21");
    await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token));
    await report(id, owner.token, "2026-11-21"); // ส่งรายงานใหม่ (ข้อมูลเดิม) → ต้องยืนยันใหม่ทั้งคู่
    const row = await prisma.adoptionRequest.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ ownerConfirmedAt: null, applicantConfirmedAt: null, handoverVersion: 3, stage: "HANDOVER_REPORTED" });
  });
});

describe("conflicting reports → dispute → admin resolution", () => {
  it("mismatch flags dispute; confirmations cannot complete it; admin needs a reason", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));
    await report(id, owner.token, "2026-11-20");
    const mismatch = await report(id, applicant.token, "2026-11-22");
    expect(mismatch.status).toBe(201);
    let row = await prisma.adoptionRequest.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ disputed: true, followUpRequired: true });
    expect((await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token))).status).toBe(400);

    const queue = await api.get("/api/admin/adoptions?queue=disputed").set(auth(admin.token));
    expect(queue.body.items.map((c: { id: number }) => c.id)).toContain(id);
    expect(queue.body.items.find((c: { id: number }) => c.id === id).followUp.priority).toBe("urgent");

    // แก้รายงานให้ตรงกันและยืนยันครบ → ยังไม่สำเร็จเพราะมีข้อพิพาท
    await report(id, applicant.token, "2026-11-20");
    await api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token));
    await api.post(`/api/adoptions/${id}/confirm`).set(auth(applicant.token));
    expect(await stage(id)).toBe("HANDOVER_REPORTED");
    expect(await petStatus(petId)).toBe("PENDING");

    expect((await api.post(`/api/admin/adoptions/${id}/review-handover`).set(auth(admin.token)).send({ decision: "COMPLETE", note: "" })).status).toBe(400);
    const done = await api.post(`/api/admin/adoptions/${id}/review-handover`).set(auth(admin.token))
      .send({ decision: "COMPLETE", note: "ตรวจรูปหลักฐานและโทรยืนยันทั้งสองฝ่ายแล้ว" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ stage: "COMPLETED", disputed: false, resolution: "ตรวจรูปหลักฐานและโทรยืนยันทั้งสองฝ่ายแล้ว" });
    expect(await petStatus(petId)).toBe("ADOPTED");
    row = await prisma.adoptionRequest.findUniqueOrThrow({ where: { id } });
    expect(row.verifiedBy).toBe(admin.id);
  });

  it("participant dispute + admin cannot complete mismatched reports", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));
    await report(id, owner.token, "2026-11-20");
    expect((await api.post(`/api/adoptions/${id}/dispute`).set(auth(applicant.token)).send({ note: "" })).status).toBe(400);
    expect((await api.post(`/api/adoptions/${id}/dispute`).set(auth(applicant.token)).send({ note: "ยังไม่ได้รับน้องเลย" })).status).toBe(200);
    expect((await api.post(`/api/adoptions/${id}/dispute`).set(auth(applicant.token)).send({ note: "แจ้งซ้ำ" })).status).toBe(409);
    const res = await api.post(`/api/admin/adoptions/${id}/review-handover`).set(auth(admin.token)).send({ decision: "COMPLETE", note: "พยายามปิดโดยไม่มีหลักฐาน" });
    expect(res.status).toBe(400);
    expect(await petStatus(petId)).toBe("PENDING");
  });
});

describe("cancel", () => {
  it("PENDING cancel deletes (can re-apply); ACCEPTED cancel keeps history as CANCELLED", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    expect((await api.delete(`/api/adoptions/${id}`).set(auth(applicant.token))).status).toBe(204);
    expect(await prisma.adoptionRequest.findUnique({ where: { id } })).toBeNull();
    const again = await apply(petId);
    await accept(again);
    expect((await api.delete(`/api/adoptions/${again}`).set(auth(owner.token))).status).toBe(403);
    expect((await api.delete(`/api/adoptions/${again}`).set(auth(applicant.token))).status).toBe(204);
    expect(await prisma.adoptionRequest.findUniqueOrThrow({ where: { id: again } })).toMatchObject({ stage: "CANCELLED", status: "CANCELLED" });
    expect(await petStatus(petId)).toBe("AVAILABLE");
  });
});

describe("concurrency (atomic conditional updates)", () => {
  it("double accept of two requests for one pet → exactly one wins", async () => {
    const petId = await newPet();
    const a = await apply(petId);
    const b = await apply(petId, second.token);
    const results = await Promise.all([accept(a), accept(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const placed = await prisma.adoptionRequest.count({ where: { petId, stage: "ACCEPTED" } });
    expect(placed).toBe(1);
    expect(await petStatus(petId)).toBe("PENDING");
  });

  it("cancel vs accept race → consistent outcome either way", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    const [cancel, approve] = await Promise.all([
      api.delete(`/api/adoptions/${id}`).set(auth(applicant.token)),
      accept(id),
    ]);
    const row = await prisma.adoptionRequest.findUnique({ where: { id } });
    if (row) {
      // ตอบรับชนะ: ยกเลิกหลังตอบรับในโหมด workflow ได้ → CANCELLED หรือยังเป็น ACCEPTED
      expect(["ACCEPTED", "CANCELLED"]).toContain(row.stage);
      expect(approve.status).toBe(200);
    } else {
      expect(cancel.status).toBe(204);
      expect([400, 404]).toContain(approve.status);
    }
    const stages = await prisma.adoptionRequest.findMany({ where: { petId }, select: { stage: true, legacyReview: true } });
    const { derivePetStatus } = await import("../src/services/adoption-workflow.js");
    expect(await petStatus(petId)).toBe(derivePetStatus(stages));
  });

  it("simultaneous confirmations complete exactly once", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));
    await report(id, owner.token, "2026-11-23");
    await report(id, applicant.token, "2026-11-23");
    const results = await Promise.all([
      api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token)),
      api.post(`/api/adoptions/${id}/confirm`).set(auth(applicant.token)),
      api.post(`/api/adoptions/${id}/confirm`).set(auth(owner.token)), // ซ้ำ
    ]);
    // ยืนยันซ้ำถูกปฏิเสธเสมอ: 409 (ยืนยันไปแล้ว) หรือ 400 (ถ้ารันหลังเคสปิดเป็น COMPLETED ไปแล้ว)
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.slice(0, 2)).toEqual([200, 200]);
    expect([400, 409]).toContain(statuses[2]);
    expect(await stage(id)).toBe("COMPLETED");
    expect(await prisma.adoptionStageHistory.count({ where: { requestId: id, toStage: "COMPLETED" } })).toBe(1);
    expect(await petStatus(petId)).toBe("ADOPTED");
  });
});

describe("follow-up policy + idempotent cron", () => {
  it("admin contact/escalate do not touch the owner's clock; escalate twice → 409", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    const old = new Date(Date.now() - 50 * 3_600_000);
    await prisma.adoptionRequest.update({ where: { id }, data: { lastActivityAt: old } });
    const detail = await api.get(`/api/admin/adoptions/${id}`).set(auth(admin.token));
    expect(detail.body.followUp).toMatchObject({ idle: 50, overdue: true, priority: "high", required: true });
    await api.post(`/api/admin/adoptions/${id}/follow-ups`).set(auth(admin.token)).send({ kind: "CONTACT", note: "โทรแล้วไม่รับสาย" });
    expect((await api.post(`/api/admin/adoptions/${id}/escalate`).set(auth(admin.token)).send({ note: "ส่งต่อหัวหน้า" })).body.followUp.priority).toBe("urgent");
    expect((await api.post(`/api/admin/adoptions/${id}/escalate`).set(auth(admin.token)).send({})).status).toBe(409);
    expect((await prisma.adoptionRequest.findUniqueOrThrow({ where: { id } })).lastActivityAt).toEqual(old);
    expect(await stage(id)).toBe("PENDING"); // ไม่มีการเปลี่ยนขั้นอัตโนมัติ
  });

  it("cron requires the secret, creates events once, never changes stages", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await prisma.adoptionRequest.update({ where: { id }, data: { lastActivityAt: new Date(Date.now() - 80 * 3_600_000) } });
    expect((await api.get("/api/internal/cron/follow-ups")).status).toBe(401);
    expect((await api.get("/api/internal/cron/follow-ups").set({ Authorization: "Bearer wrong-secret-wrong-secret-wrong-secret" })).status).toBe(401);

    const first = await api.get("/api/internal/cron/follow-ups").set({ Authorization: `Bearer ${process.env.CRON_SECRET}` });
    expect(first.status).toBe(200);
    const cronKinds = ["ADMIN_FOLLOW_UP", "ESCALATION", "OWNER_REMINDER", "OWNER_SECOND_REMINDER"];
    const events = await prisma.notificationEvent.findMany({ where: { requestId: id, kind: { in: cronKinds } }, orderBy: { kind: "asc" } });
    expect(events.map((e) => e.kind)).toEqual(cronKinds);
    const again = await followUpService.sweep();
    expect(await prisma.notificationEvent.count({ where: { requestId: id, kind: { in: cronKinds } } })).toBe(4);
    expect(again.created).toBe(0);
    expect(await stage(id)).toBe("PENDING");

    const mine = await api.get("/api/me/notifications").set(auth(owner.token));
    expect(mine.body.items.filter((e: { requestId: number }) => e.requestId === id).map((e: { kind: string }) => e.kind).sort())
      .toEqual(["NEW_REQUEST", "OWNER_REMINDER", "OWNER_SECOND_REMINDER"]);
    // ผู้ขอไม่เห็นแจ้งเตือนของเจ้าของ · คิวผู้ดูแล (recipient null) ไม่แสดงให้ใคร
    const applicantItems = (await api.get("/api/me/notifications").set(auth(applicant.token))).body.items;
    expect(applicantItems.some((e: { requestId: number }) => e.requestId === id)).toBe(false);
  });

  it("timeline shows reports, confirmations and admin actions in order", async () => {
    const petId = await newPet();
    const id = await apply(petId);
    await accept(id);
    await api.post(`/api/adoptions/${id}/arrange`).set(auth(owner.token));
    await report(id, owner.token, "2026-11-19");
    await api.post(`/api/admin/adoptions/${id}/follow-ups`).set(auth(admin.token)).send({ kind: "NOTE", note: "รอผู้ขอรายงาน" });
    const res = await api.get(`/api/admin/adoptions/${id}/timeline`).set(auth(admin.token));
    expect(res.body.map((e: { kind: string; label: string }) => `${e.kind}:${e.label}`)).toEqual([
      "STAGE:ส่งคำขอรับเลี้ยง",
      "STAGE:เจ้าของตอบรับคำขอ",
      "STAGE:เริ่มนัดส่งมอบ",
      "STAGE:บันทึกรายงานส่งมอบ",
      "REPORT:รายงานส่งมอบ: ส่งมอบแล้ว (2026-11-19)",
      "FOLLOW_UP:เพิ่มบันทึกติดตาม",
    ]);
  });
});
