// แจ้งเตือนในเว็บ · รายละเอียด/ไทม์ไลน์ของผู้เกี่ยวข้อง · /config · ประกาศตั้งเวลา (workflow เปิด)
import request from "supertest";
import { describe, expect, inject, it, vi } from "vitest";

process.env.DATABASE_URL = inject("adminDatabaseUrl");
process.env.ADOPTION_HANDOVER_WORKFLOW = "true";
vi.mock("../src/config/supabase.js", () => import("./fake-supabase.js"));

const { app } = await import("../src/app.js");
const { registerAccount } = await import("./fake-supabase.js");
const { prisma } = await import("../src/config/prisma.js");

const api = request(app);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const owner = await registerAccount("nt-owner@pawhome.test", "เจ้าของแจ้งเตือน");
const applicant = await registerAccount("nt-applicant@pawhome.test", "ผู้ขอแจ้งเตือน");
const stranger = await registerAccount("nt-stranger@pawhome.test", "คนนอกแจ้งเตือน");
const admin = await registerAccount("nt-admin@pawhome.test", "ผู้ดูแลแจ้งเตือน");
await prisma.adminMembership.create({ data: { userId: admin.id, role: "ADMIN" } });

const form = { phone: "0833333333", housing: "HOUSE", message: "มีบ้านพร้อมรั้วรอบขอบชิด มีเวลาดูแลน้องทุกวัน" };
const pet = (await api.post("/api/pets").set(auth(owner.token)).send({
  name: "น้องแจ้งเตือน", species: "DOG", breed: "", ageMonths: 10, sex: "FEMALE", province: "สระบุรี", imageUrl: "",
  description: "โพสต์สำหรับทดสอบการแจ้งเตือนในเว็บของ PawHome", vaccinated: true, sterilized: true, urgent: false,
})).body.id as number;
const requestId = (await api.post(`/api/pets/${pet}/adoptions`).set(auth(applicant.token)).send(form)).body.id as number;
const inbox = async (token: string) => (await api.get("/api/me/notifications").set(auth(token))).body as { unread: number; items: { id: string; kind: string; requestId: number | null; read: boolean; link: string; title: string }[] };

describe("public config", () => {
  it("tells the frontend whether the handover workflow is on (no secrets)", async () => {
    const res = await api.get("/api/config");
    expect(res.body).toEqual({ adoptionHandoverWorkflow: true, followUp: { reminderHours: 24, adminHours: 48, escalationHours: 72 } });
  });
});

describe("event notifications", () => {
  it("new request notifies the owner with a link to the pet", async () => {
    const box = await inbox(owner.token);
    const item = box.items.find((n) => n.requestId === requestId && n.kind === "NEW_REQUEST")!;
    expect(item).toMatchObject({ read: false, link: `/pets/${pet}`, title: "มีคำขอรับเลี้ยงใหม่" });
    expect(box.unread).toBeGreaterThanOrEqual(1);
  });

  it("each workflow step notifies the other party", async () => {
    await api.patch(`/api/adoptions/${requestId}`).set(auth(owner.token)).send({ status: "APPROVED" });
    await api.post(`/api/adoptions/${requestId}/arrange`).set(auth(owner.token));
    await api.post(`/api/adoptions/${requestId}/handover-reports`).set(auth(owner.token)).send({ handoverDate: "2026-11-25", outcome: "HANDED_OVER" });
    const kinds = (await inbox(applicant.token)).items.filter((n) => n.requestId === requestId).map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(["REQUEST_ACCEPTED", "HANDOVER_ARRANGED", "HANDOVER_REPORTED"]));
    await api.post(`/api/adoptions/${requestId}/handover-reports`).set(auth(applicant.token)).send({ handoverDate: "2026-11-25", outcome: "HANDED_OVER" });
    await api.post(`/api/adoptions/${requestId}/confirm`).set(auth(applicant.token));
    await api.post(`/api/adoptions/${requestId}/confirm`).set(auth(owner.token));
    for (const token of [owner.token, applicant.token]) {
      expect((await inbox(token)).items.some((n) => n.requestId === requestId && n.kind === "ADOPTION_COMPLETED")).toBe(true);
    }
  });

  it("mark one / mark all as read; cannot read someone else's notification", async () => {
    const box = await inbox(applicant.token);
    const first = box.items[0];
    expect((await api.patch(`/api/me/notifications/${first.id}/read`).set(auth(stranger.token))).status).toBe(404);
    expect((await api.patch(`/api/me/notifications/abc/read`).set(auth(applicant.token))).status).toBe(404);
    expect((await api.patch(`/api/me/notifications/${first.id}/read`).set(auth(applicant.token))).status).toBe(204);
    expect((await inbox(applicant.token)).unread).toBe(box.unread - 1);
    expect((await api.post("/api/me/notifications/read-all").set(auth(applicant.token))).body.updated).toBe(box.unread - 1);
    expect((await inbox(applicant.token)).unread).toBe(0);
    expect((await api.get("/api/me/notifications")).status).toBe(401);
  });

  it("strangers see none of these notifications", async () => {
    expect((await inbox(stranger.token)).items.some((n) => n.requestId === requestId)).toBe(false);
  });
});

describe("participant detail + timeline", () => {
  it("owner and applicant can read; others cannot; admin notes are not exposed", async () => {
    await api.post(`/api/admin/adoptions/${requestId}/follow-ups`).set(auth(admin.token)).send({ kind: "NOTE", note: "บันทึกภายในของผู้ดูแล" });
    for (const token of [owner.token, applicant.token]) {
      const detail = await api.get(`/api/adoptions/${requestId}`).set(auth(token));
      expect(detail.body).toMatchObject({ stage: "COMPLETED", handover: { ownerConfirmed: true, applicantConfirmed: true, owner: { handoverDate: "2026-11-25" } } });
      const timeline = await api.get(`/api/adoptions/${requestId}/timeline`).set(auth(token));
      expect(timeline.body.map((e: { label: string }) => e.label)).toContain("ยืนยันส่งมอบครบสองฝ่าย · รับเลี้ยงสำเร็จ");
      expect(JSON.stringify(timeline.body)).not.toContain("บันทึกภายในของผู้ดูแล");
    }
    expect((await api.get(`/api/adoptions/${requestId}`).set(auth(stranger.token))).status).toBe(403);
    expect((await api.get(`/api/adoptions/${requestId}/timeline`).set(auth(stranger.token))).status).toBe(403);
    expect((await api.get(`/api/adoptions/${requestId}/timeline`)).status).toBe(401);
  });
});

