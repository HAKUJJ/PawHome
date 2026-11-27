import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { statusOfStage, type Stage } from "../services/adoption-workflow.js";
import type { AdoptionRequest, AdoptionStage, AdoptionStatus, HandoverReport, Housing } from "../types/dto.js";
import type { AdoptionInput } from "../validators/adoptions.validator.js";
import { toPet, withOwner } from "./pets.repository.js";

type Db = Prisma.TransactionClient;
export type ActorRole = "OWNER" | "APPLICANT" | "ADMIN" | "SYSTEM";
export type Party = "OWNER" | "APPLICANT";

const include = {
  pet: { include: withOwner },
  user: { select: { name: true } },
  handoverReports: { orderBy: { id: "desc" } },
} satisfies Prisma.AdoptionRequestInclude;
type Row = Prisma.AdoptionRequestGetPayload<{ include: typeof include }>;

function toReport(r: Row["handoverReports"][number] | undefined): HandoverReport | null {
  if (!r) return null;
  return {
    handoverDate: r.handoverDate.toISOString().slice(0, 10), outcome: r.outcome as HandoverReport["outcome"],
    note: r.note, evidenceUrl: r.evidenceUrl, createdAt: r.createdAt.toISOString(),
  };
}

function toAdoption(row: Row): AdoptionRequest {
  // รายงานเรียงใหม่ → เก่า: ตัวแรกของแต่ละฝ่าย = ล่าสุด
  const latest = (party: string) => row.handoverReports.find((r) => r.party === party);
  return {
    id: row.id,
    petId: row.petId,
    userId: row.userId,
    userName: row.user.name,
    phone: row.phone,
    housing: row.housing as Housing,
    message: row.message,
    status: row.status as AdoptionStatus,
    stage: row.stage as AdoptionStage,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    disputed: row.disputed,
    legacyReview: row.legacyReview,
    completedAt: row.completedAt?.toISOString() ?? null,
    handover: {
      owner: toReport(latest("OWNER")),
      applicant: toReport(latest("APPLICANT")),
      ownerConfirmed: Boolean(row.ownerConfirmedAt),
      applicantConfirmed: Boolean(row.applicantConfirmedAt),
    },
    pet: toPet(row.pet),
  };
}

const newest = { createdAt: "desc" } as const;

export const adoptionsRepository = {
  async listByUser(userId: string): Promise<AdoptionRequest[]> {
    return (await prisma.adoptionRequest.findMany({ where: { userId }, include, orderBy: newest })).map(toAdoption);
  },

  async listByPet(petId: number): Promise<AdoptionRequest[]> {
    return (await prisma.adoptionRequest.findMany({ where: { petId }, include, orderBy: newest })).map(toAdoption);
  },

  // แบบดิบ (มี pet.ownerId) ไว้ตรวจสิทธิ์ใน service
  findById: (id: number, db: Db = prisma) =>
    db.adoptionRequest.findUnique({ where: { id }, include: { pet: { select: { ownerId: true, name: true } } } }),

  exists: async (userId: string, petId: number, db: Db = prisma) =>
    (await db.adoptionRequest.count({ where: { userId, petId } })) > 0,

  async get(id: number, db: Db = prisma): Promise<AdoptionRequest> {
    return toAdoption(await db.adoptionRequest.findUniqueOrThrow({ where: { id }, include }));
  },

  create: (userId: string, petId: number, input: AdoptionInput, db: Db = prisma) =>
    db.adoptionRequest.create({ data: { ...input, userId, petId } }),

  // เปลี่ยนขั้นแบบมีเงื่อนไขในคำสั่งเดียว (atomic): ได้ 0 แถว = มีคนเปลี่ยน/ลบไปก่อนแล้ว หรือเงื่อนไขไม่ตรง
  // status เดิมเปลี่ยนตาม stage เสมอ · last_activity_at = เวลาที่มีการดำเนินการสำคัญ (ใช้นับเวลาเงียบ)
  moveStage: async (
    id: number,
    from: readonly Stage[],
    to: Stage,
    db: Db,
    where: Prisma.AdoptionRequestWhereInput = {},
    extra: Prisma.AdoptionRequestUpdateManyMutationInput = {},
  ) =>
    (
      await db.adoptionRequest.updateMany({
        where: { ...where, id, stage: { in: [...from] } },
        data: { ...extra, stage: to, status: statusOfStage(to), lastActivityAt: new Date() },
      })
    ).count,

  // อัปเดตธง/การยืนยันโดยไม่เปลี่ยนขั้น (ไม่แตะ last_activity_at)
  updateWhere: async (id: number, where: Prisma.AdoptionRequestWhereInput, data: Prisma.AdoptionRequestUpdateManyMutationInput, db: Db) =>
    (await db.adoptionRequest.updateMany({ where: { ...where, id }, data })).count,

  addHistory: (
    db: Db,
    entry: { requestId: number; fromStage: string | null; toStage: string; actorId: string | null; actorRole: ActorRole; note?: string },
  ) => db.adoptionStageHistory.create({ data: { ...entry, note: entry.note ?? "" } }),

  // คำขออื่นที่ยังรอของน้องตัวเดียวกัน → ไม่ผ่าน (เมื่อน้องได้บ้านแล้ว) พร้อมประวัติ · คืนรายการที่ปฏิเสธ (ไว้แจ้งเตือนผู้ขอ)
  async rejectOtherPending(petId: number, exceptId: number, note: string, db: Db) {
    const others = await db.adoptionRequest.findMany({ where: { petId, stage: "PENDING", id: { not: exceptId } }, select: { id: true, userId: true } });
    const rejected: { id: number; userId: string }[] = [];
    for (const other of others) {
      if (await adoptionsRepository.moveStage(other.id, ["PENDING"], "REJECTED", db)) {
        await adoptionsRepository.addHistory(db, { requestId: other.id, fromStage: "PENDING", toStage: "REJECTED", actorId: null, actorRole: "SYSTEM", note });
        rejected.push(other);
      }
    }
    return rejected;
  },

  // ไทม์ไลน์สำหรับเจ้าของ/ผู้ขอ: การเปลี่ยนขั้น + รายงานส่งมอบ (ไม่รวมบันทึกภายในของผู้ดูแล)
  async participantTimeline(requestId: number, db: Db = prisma) {
    const [history, reports] = await Promise.all([
      db.adoptionStageHistory.findMany({ where: { requestId }, orderBy: { id: "asc" } }),
      db.adoptionHandoverReport.findMany({ where: { requestId }, orderBy: { id: "asc" } }),
    ]);
    return [
      ...history.map((h) => ({ at: h.createdAt.toISOString(), kind: "STAGE" as const, actorRole: h.actorRole, label: h.note || h.toStage, stage: h.toStage })),
      ...reports.map((r) => ({
        at: r.createdAt.toISOString(), kind: "REPORT" as const, actorRole: r.party,
        label: `รายงานส่งมอบ: ${r.outcome === "HANDED_OVER" ? "ส่งมอบแล้ว" : "ยังไม่ได้ส่งมอบ"} (${r.handoverDate.toISOString().slice(0, 10)})${r.note ? ` · ${r.note}` : ""}`,
        stage: null,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  },

  // ลบเฉพาะคำขอที่ยัง PENDING ในคำสั่งเดียว — กันกรณีเจ้าของกดอนุมัติระหว่างที่ผู้ขอกดยกเลิก
  deletePending: async (id: number, db: Db = prisma) =>
    (await db.adoptionRequest.deleteMany({ where: { id, stage: "PENDING" } })).count,

  stagesOfPet: (petId: number, db: Db = prisma) =>
    db.adoptionRequest.findMany({ where: { petId }, select: { stage: true, legacyReview: true } }),

  // รายงานล่าสุดของแต่ละฝ่าย
  async latestReports(requestId: number, db: Db = prisma) {
    const [owner, applicant] = await Promise.all(
      (["OWNER", "APPLICANT"] as const).map((party) =>
        db.adoptionHandoverReport.findFirst({ where: { requestId, party }, orderBy: { id: "desc" } }),
      ),
    );
    return { owner, applicant };
  },

  addReport: (
    db: Db,
    data: { requestId: number; party: Party; handoverDate: Date; outcome: string; note: string; evidenceUrl: string; version: number; reporterId: string },
  ) => db.adoptionHandoverReport.create({ data }),
};
