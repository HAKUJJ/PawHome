// งานผู้ดูแลกับคำขอรับเลี้ยง: ดูคิว ติดตาม บันทึก ส่งต่อ ตรวจผลส่งมอบ ปิดเคส
// ผู้ดูแลไม่ตอบรับ/เลือกผู้รับเลี้ยงแทนเจ้าของ · ทุกการกระทำบันทึก adoption_follow_ups + admin_audit_logs ใน transaction เดียว
// query ฝั่งผู้ดูแลเป็น read model เฉพาะหน้านี้ จึงเรียก Prisma ตรงใน service (repository เดิมใช้กับ API สาธารณะ)
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { Admin } from "../middleware/admin.js";
import { ApiError } from "../middleware/error.js";
import { adoptionsRepository } from "../repositories/adoptions.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import type { AdminCase, AdminHandoverReport, Paged, Priority, TimelineEvent } from "../types/admin.js";
import type { AdoptionStage, AdoptionStatus, Housing } from "../types/dto.js";
import type { CaseFilters, FollowUpInput, ReviewHandoverInput } from "../validators/admin.validator.js";
import { followUp, isTerminal, reportsMatch } from "./adoption-workflow.js";
import { syncPetStatus } from "./adoptions.service.js";
import { followUpPolicy } from "./follow-up.service.js";
import { notificationsService } from "./notifications.service.js";

type Db = Prisma.TransactionClient;

const caseInclude = {
  pet: { select: { name: true, imageUrl: true, ownerId: true, owner: { select: { name: true } } } },
  user: { select: { name: true } },
  handoverReports: { orderBy: { id: "desc" } },
} satisfies Prisma.AdoptionRequestInclude;
type CaseRow = Prisma.AdoptionRequestGetPayload<{ include: typeof caseInclude }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toReport(row: CaseRow["handoverReports"][number] | undefined): AdminHandoverReport | null {
  if (!row) return null;
  return {
    party: row.party as AdminHandoverReport["party"],
    handoverDate: row.handoverDate.toISOString().slice(0, 10),
    outcome: row.outcome as AdminHandoverReport["outcome"],
    note: row.note,
    evidenceUrl: row.evidenceUrl,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCase(row: CaseRow, now: Date): AdminCase {
  // รายงานเรียงใหม่ → เก่า: ตัวแรกของแต่ละฝ่าย = ล่าสุด
  const latest = (party: string) => row.handoverReports.find((r) => r.party === party);
  return {
    id: row.id,
    petId: row.petId,
    petName: row.pet.name,
    petImageUrl: row.pet.imageUrl,
    ownerId: row.pet.ownerId,
    ownerName: row.pet.owner.name,
    applicantId: row.userId,
    applicantName: row.user.name,
    phone: row.phone,
    housing: row.housing as Housing,
    message: row.message,
    stage: row.stage as AdoptionStage,
    status: row.status as AdoptionStatus,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    followUpRequired: row.followUpRequired,
    escalated: row.escalated,
    disputed: row.disputed,
    legacyReview: row.legacyReview,
    closedAt: iso(row.closedAt),
    completedAt: iso(row.completedAt),
    verifiedAt: iso(row.verifiedAt),
    resolution: row.resolution,
    handoverVersion: row.handoverVersion,
    reports: { owner: toReport(latest("OWNER")), applicant: toReport(latest("APPLICANT")) },
    confirmations: { owner: Boolean(row.ownerConfirmedAt), applicant: Boolean(row.applicantConfirmedAt) },
    followUp: followUp(row, now, followUpPolicy),
  };
}

async function loadCase(id: number, db: Db = prisma) {
  const row = await db.adoptionRequest.findUnique({ where: { id }, include: caseInclude });
  if (!row) throw new ApiError(404, "ไม่พบคำขอ");
  return row;
}

const FOLLOW_UP_LABEL: Record<string, string> = {
  FLAG: "ตั้งธงต้องติดตาม",
  UNFLAG: "นำธงต้องติดตามออก",
  CONTACT: "บันทึกการติดต่อ",
  NOTE: "เพิ่มบันทึกติดตาม",
  ESCALATE: "ส่งต่อเคสเร่งด่วน",
  RESOLVE: "ติดตามเสร็จแล้ว",
  DISPUTE: "ทำเครื่องหมายข้อพิพาท",
  VERIFY: "ยืนยันผลตรวจสอบ",
  REOPEN: "เปิดเคสให้ดำเนินการต่อ",
  CLOSE: "ปิดเคส",
};

// ผู้ดูแลทำงานกับเคสที่ปิดแล้วไม่ได้
function requireOpen(row: CaseRow) {
  if (row.closedAt) throw new ApiError(409, "เคสนี้ปิดแล้ว");
}

async function record(tx: Db, admin: Admin, requestId: number, kind: string, note: string, changes: Prisma.InputJsonObject = {}) {
  await tx.adoptionFollowUp.create({ data: { requestId, kind, note, actorId: admin.id } });
  await auditRepository.record(tx, admin, { action: `adoption.${kind.toLowerCase()}`, targetType: "adoption_request", targetId: requestId, changes, reason: note });
}

export const adminAdoptionsService = {
  // shortcut: คำนวณความเร่งด่วนในหน่วยความจำ (ขึ้นกับเวลาปัจจุบัน), ถ้าคำขอเกินหลักหมื่นย้ายไปคำนวณใน SQL
  async list(filters: CaseFilters, now = new Date()): Promise<Paged<AdminCase>> {
    const where: Prisma.AdoptionRequestWhereInput = {};
    if (filters.stage) where.stage = filters.stage;
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { pet: { name: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        ...(/^\d+$/.test(q) ? [{ id: Number(q) }] : []),
      ];
    }
    const rows = await prisma.adoptionRequest.findMany({ where, include: caseInclude, orderBy: { createdAt: "desc" }, take: 2000 });
    let cases = rows.map((r) => toCase(r, now));
    if (filters.priority) cases = cases.filter((c) => c.followUp.priority === filters.priority);
    if (filters.queue === "follow-up") cases = cases.filter((c) => c.followUp.required);
    if (filters.queue === "overdue") cases = cases.filter((c) => c.followUp.overdue);
    if (filters.queue === "disputed") cases = cases.filter((c) => c.disputed);
    if (filters.queue === "legacy") cases = cases.filter((c) => c.legacyReview);
    const rank: Record<Priority, number> = { urgent: 3, high: 2, reminder: 1, normal: 0 };
    if (filters.sort === "priority") cases.sort((a, b) => rank[b.followUp.priority] - rank[a.followUp.priority] || b.followUp.idle - a.followUp.idle);
    const start = (filters.page - 1) * filters.limit;
    return { items: cases.slice(start, start + filters.limit), total: cases.length, page: filters.page, limit: filters.limit };
  },

  get: async (id: number): Promise<AdminCase> => toCase(await loadCase(id), new Date()),

  // ไทม์ไลน์รวม: การเปลี่ยนขั้น + รายงานส่งมอบ + บันทึกผู้ดูแล
  async timeline(id: number): Promise<TimelineEvent[]> {
    const row = await loadCase(id);
    const [history, followUps] = await Promise.all([
      prisma.adoptionStageHistory.findMany({ where: { requestId: id }, orderBy: { id: "asc" } }),
      prisma.adoptionFollowUp.findMany({ where: { requestId: id }, orderBy: { id: "asc" } }),
    ]);
    const actorIds = [...new Set([...history, ...followUps].map((e) => e.actorId).filter((v): v is string => Boolean(v)))];
    const names = new Map((await prisma.profile.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
    const name = (id: string | null, fallback: string) => (id ? names.get(id) ?? "ผู้ใช้ที่ถูกลบ" : fallback);
    const events: TimelineEvent[] = [
      ...history.map((h) => ({
        at: h.createdAt.toISOString(), kind: "STAGE" as const, actorRole: h.actorRole,
        actorName: name(h.actorId, "ระบบ"), label: h.note || h.toStage, note: "",
      })),
      ...followUps.map((f) => ({
        at: f.createdAt.toISOString(), kind: "FOLLOW_UP" as const, actorRole: "ADMIN",
        actorName: name(f.actorId, "ผู้ดูแล"), label: FOLLOW_UP_LABEL[f.kind] ?? f.kind, note: f.note,
      })),
      ...row.handoverReports.map((r) => ({
        at: r.createdAt.toISOString(), kind: "REPORT" as const, actorRole: r.party,
        actorName: r.party === "OWNER" ? row.pet.owner.name : row.user.name,
        label: `รายงานส่งมอบ: ${r.outcome === "HANDED_OVER" ? "ส่งมอบแล้ว" : "ยังไม่ได้ส่งมอบ"} (${r.handoverDate.toISOString().slice(0, 10)})`,
        note: r.note,
      })),
    ];
    return events.sort((a, b) => a.at.localeCompare(b.at));
  },

  // ติดตาม: ตั้ง/เอาธงออก · บันทึกการติดต่อ · โน้ต · ติดตามเสร็จ — ไม่แตะ last_activity_at (ไม่รีเซ็ตเวลาเงียบของเจ้าของ)
  followUp(admin: Admin, id: number, input: FollowUpInput): Promise<AdminCase> {
    return prisma.$transaction(async (tx) => {
      const row = await loadCase(id, tx);
      requireOpen(row);
      const note = input.note ?? "";
      if (input.kind === "FLAG") {
        if (!(await adoptionsRepository.updateWhere(id, { followUpRequired: false }, { followUpRequired: true }, tx))) throw new ApiError(409, "เคสนี้ติดธงอยู่แล้ว");
      } else if (input.kind === "UNFLAG") {
        if (!(await adoptionsRepository.updateWhere(id, { followUpRequired: true }, { followUpRequired: false }, tx))) throw new ApiError(409, "เคสนี้ไม่ได้ติดธง");
      } else if (input.kind === "RESOLVE") {
        // ข้อพิพาท/ข้อมูลระบบเดิมต้องจบด้วย review-handover (มีเหตุผล) ไม่ใช่ปิดธงเฉย ๆ
        if (row.disputed || row.legacyReview) throw new ApiError(409, "เคสข้อพิพาทหรือข้อมูลระบบเดิมต้องตรวจผลการส่งมอบก่อน");
        await adoptionsRepository.updateWhere(id, {}, { followUpRequired: false, escalated: false }, tx);
      }
      await record(tx, admin, id, input.kind, note);
      return toCase(await loadCase(id, tx), new Date());
    });
  },

  escalate(admin: Admin, id: number, note: string): Promise<AdminCase> {
    return prisma.$transaction(async (tx) => {
      const row = await loadCase(id, tx);
      requireOpen(row);
      if (isTerminal(row.stage) && !row.legacyReview) throw new ApiError(409, "คำขอนี้จบแล้ว ส่งต่อไม่ได้");
      if (!(await adoptionsRepository.updateWhere(id, { escalated: false }, { escalated: true, followUpRequired: true }, tx))) {
        throw new ApiError(409, "เคสนี้ถูกส่งต่อแล้ว");
      }
      await record(tx, admin, id, "ESCALATE", note);
      return toCase(await loadCase(id, tx), new Date());
    });
  },

  // ตรวจผลการส่งมอบ (ต้องมีเหตุผลทุกครั้ง):
  // MARK_DISPUTED · COMPLETE (รายงานตรงกัน + ยืนยันครบ หรือข้อมูลระบบเดิมที่ผู้ดูแลติดต่อยืนยันแล้ว) · VERIFY (เคสสำเร็จแล้ว) · REOPEN (ข้อมูลระบบเดิมที่ยังไม่ได้ส่งมอบจริง)
  reviewHandover(admin: Admin, id: number, input: ReviewHandoverInput): Promise<AdminCase> {
    return prisma.$transaction(async (tx) => {
      const row = await loadCase(id, tx);
      requireOpen(row);
      const now = new Date();
      const { note } = input;
      const changed = () => new ApiError(409, "คำขอนี้เปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่");

      if (input.decision === "MARK_DISPUTED") {
        if (row.stage !== "HANDOVER_REPORTED") throw new ApiError(400, "ทำเครื่องหมายข้อพิพาทได้เมื่อมีรายงานส่งมอบแล้ว");
        if (!(await adoptionsRepository.updateWhere(id, { stage: "HANDOVER_REPORTED", disputed: false }, { disputed: true, followUpRequired: true }, tx))) {
          throw new ApiError(409, "เคสนี้เป็นข้อพิพาทอยู่แล้ว");
        }
        await record(tx, admin, id, "DISPUTE", note);
        await notificationsService.notify(tx, [row.userId, row.pet.ownerId].map((recipientId) => ({ recipientId, kind: "HANDOVER_DISPUTED" as const, requestId: id })));
      } else if (input.decision === "VERIFY") {
        if (row.stage !== "COMPLETED" || row.verifiedAt) throw new ApiError(400, "ยืนยันผลตรวจได้เฉพาะเคสที่รับเลี้ยงสำเร็จและยังไม่ได้ตรวจ");
        await adoptionsRepository.updateWhere(id, { stage: "COMPLETED", verifiedAt: null }, { verifiedAt: now, verifiedBy: admin.id, resolution: note }, tx);
        await record(tx, admin, id, "VERIFY", note);
      } else if (input.decision === "REOPEN") {
        if (!row.legacyReview || row.stage !== "ACCEPTED") throw new ApiError(400, "เปิดให้ดำเนินการต่อได้เฉพาะคำขอจากระบบเดิมที่ยังรอตรวจ");
        if (!(await adoptionsRepository.updateWhere(id, { stage: "ACCEPTED", legacyReview: true }, { legacyReview: false, followUpRequired: false }, tx))) throw changed();
        await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "ACCEPTED", toStage: "ACCEPTED", actorId: admin.id, actorRole: "ADMIN", note: "ผู้ดูแลตรวจแล้ว: ยังไม่ได้ส่งมอบจริง · ให้ดำเนินการส่งมอบต่อ" });
        await record(tx, admin, id, "REOPEN", note);
        await syncPetStatus(row.petId, tx); // น้องกลับเป็น "มีคนขอ" ไม่ใช่ "ได้บ้านแล้ว"
      } else {
        // COMPLETE
        const owner = row.handoverReports.find((r) => r.party === "OWNER");
        const applicant = row.handoverReports.find((r) => r.party === "APPLICANT");
        const viaReports = row.stage === "HANDOVER_REPORTED" && reportsMatch(owner, applicant) && row.ownerConfirmedAt && row.applicantConfirmedAt;
        const viaLegacy = row.stage === "ACCEPTED" && row.legacyReview;
        if (!viaReports && !viaLegacy) {
          throw new ApiError(400, "ปิดเป็นรับเลี้ยงสำเร็จได้เมื่อรายงานสองฝ่ายตรงกันและยืนยันครบ หรือเป็นข้อมูลระบบเดิมที่ยืนยันการส่งมอบแล้ว");
        }
        const moved = await adoptionsRepository.moveStage(
          id, [row.stage as "HANDOVER_REPORTED" | "ACCEPTED"], "COMPLETED", tx,
          { handoverVersion: row.handoverVersion, legacyReview: row.legacyReview },
          { completedAt: now, verifiedAt: now, verifiedBy: admin.id, resolution: note, disputed: false, legacyReview: false, followUpRequired: false, escalated: false },
        );
        if (!moved) throw changed();
        await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: row.stage, toStage: "COMPLETED", actorId: admin.id, actorRole: "ADMIN", note: "ผู้ดูแลยืนยันผลตรวจสอบ · รับเลี้ยงสำเร็จ" });
        await record(tx, admin, id, "VERIFY", note, { decision: "COMPLETE", from: row.stage });
        const rejected = await adoptionsRepository.rejectOtherPending(row.petId, id, "น้องได้บ้านแล้ว", tx);
        await notificationsService.notify(tx, [
          ...[row.userId, row.pet.ownerId].map((recipientId) => ({ recipientId, kind: "ADOPTION_COMPLETED" as const, requestId: id })),
          ...rejected.map((r) => ({ recipientId: r.userId, kind: "REQUEST_REJECTED" as const, requestId: r.id })),
        ]);
        await syncPetStatus(row.petId, tx);
      }
      return toCase(await loadCase(id, tx), now);
    });
  },

  close(admin: Admin, id: number, note: string): Promise<AdminCase> {
    return prisma.$transaction(async (tx) => {
      const row = await loadCase(id, tx);
      requireOpen(row);
      if (!isTerminal(row.stage) || row.legacyReview) throw new ApiError(400, "ปิดเคสได้เมื่อคำขอจบแล้ว (สำเร็จ / ปฏิเสธ / ยกเลิก)");
      if (!(await adoptionsRepository.updateWhere(id, { closedAt: null }, { closedAt: new Date(), followUpRequired: false, escalated: false }, tx))) {
        throw new ApiError(409, "เคสนี้ปิดแล้ว");
      }
      await record(tx, admin, id, "CLOSE", note);
      return toCase(await loadCase(id, tx), new Date());
    });
  },
};
