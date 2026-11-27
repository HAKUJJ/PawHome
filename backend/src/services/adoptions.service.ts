import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../middleware/error.js";
import { adoptionsRepository, type Party } from "../repositories/adoptions.repository.js";
import { petsRepository } from "../repositories/pets.repository.js";
import type { AdoptionRequest } from "../types/dto.js";
import type { AdoptionInput, DisputeInput, HandoverReportInput, ReviewStatus } from "../validators/adoptions.validator.js";
import { derivePetStatus, reportsConflict, reportsMatch } from "./adoption-workflow.js";
import { notificationsService } from "./notifications.service.js";
import { findPetOr404 } from "./pets.service.js";
import { isOwnUpload } from "./uploads.service.js";

type Db = Prisma.TransactionClient;

export { derivePetStatus };

// สถานะน้องต้องตรงกับคำขอเสมอ → คำนวณใหม่ใน transaction เดียวกับที่เปลี่ยนคำขอ
export async function syncPetStatus(petId: number, tx: Db) {
  await petsRepository.setStatus(petId, derivePetStatus(await adoptionsRepository.stagesOfPet(petId, tx)), tx);
}

async function findRequestOr404(id: number, tx: Db) {
  const request = await adoptionsRepository.findById(id, tx);
  if (!request) throw new ApiError(404, "ไม่พบคำขอ");
  return request;
}

type RequestRow = NonNullable<Awaited<ReturnType<typeof adoptionsRepository.findById>>>;

function partyOf(request: RequestRow, userId: string): Party {
  if (request.pet.ownerId === userId) return "OWNER";
  if (request.userId === userId) return "APPLICANT";
  throw new ApiError(403, "ทำได้เฉพาะเจ้าของโพสต์และผู้ขอรับเลี้ยงของคำขอนี้");
}

// อีกฝ่ายของคำขอ (ไว้ส่งแจ้งเตือน)
const otherParty = (request: RequestRow, party: Party) => (party === "OWNER" ? request.userId : request.pet.ownerId);
const notify = notificationsService.notify;

function requireHandoverWorkflow() {
  if (!env.ADOPTION_HANDOVER_WORKFLOW) throw new ApiError(404, "ขั้นตอนรายงานส่งมอบยังไม่เปิดใช้งาน");
}

// ข้อมูลจากระบบเดิมที่ยังรอผู้ดูแลตรวจ → เจ้าของ/ผู้ขอทำขั้นต่อไม่ได้จนกว่าผู้ดูแลจะตัดสิน
function requireNotLegacy(request: RequestRow) {
  if (request.legacyReview) throw new ApiError(409, "คำขอนี้รอผู้ดูแลยืนยันการส่งมอบจากระบบเดิม");
}

const conflict = () => new ApiError(409, "คำขอนี้เปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่");

// unique index adoption_requests_one_approved_per_pet: ตอบรับพร้อมกันสองคำขอของน้องตัวเดียว → อันหลังได้ 409
function translatePlacementConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, "น้องตัวนี้มีผู้ขอที่ได้รับการตอบรับแล้ว");
  }
  throw error;
}

export const adoptionsService = {
  listMine: (userId: string) => adoptionsRepository.listByUser(userId),

  // รายละเอียด + ไทม์ไลน์ของคำขอ: เฉพาะเจ้าของโพสต์และผู้ขอ
  async get(userId: string, id: number): Promise<AdoptionRequest> {
    const request = await findRequestOr404(id, prisma);
    partyOf(request, userId);
    return adoptionsRepository.get(id);
  },

  async timeline(userId: string, id: number) {
    const request = await findRequestOr404(id, prisma);
    partyOf(request, userId);
    return adoptionsRepository.participantTimeline(id);
  },

  // มีเบอร์โทรผู้ขอ → ให้ดูเฉพาะเจ้าของโพสต์
  async listForPet(userId: string, petId: number): Promise<AdoptionRequest[]> {
    const pet = await findPetOr404(petId);
    if (pet.ownerId !== userId) throw new ApiError(403, "ดูคำขอได้เฉพาะเจ้าของโพสต์");
    return adoptionsRepository.listByPet(petId);
  },

  create(userId: string, petId: number, input: AdoptionInput): Promise<AdoptionRequest> {
    return prisma.$transaction(async (tx) => {
      const pet = await petsRepository.findById(petId, tx);
      if (!pet || pet.visibility !== "VISIBLE") throw new ApiError(404, "ไม่พบน้องที่ต้องการ");
      if (pet.ownerId === userId) throw new ApiError(400, "ขอรับเลี้ยงน้องที่ตัวเองโพสต์ไม่ได้");
      if (pet.status === "ADOPTED") throw new ApiError(400, "น้องได้บ้านแล้ว");
      if (await adoptionsRepository.exists(userId, petId, tx)) throw new ApiError(409, "คุณยื่นคำขอน้องตัวนี้ไปแล้ว");

      const created = await adoptionsRepository.create(userId, petId, input, tx);
      await adoptionsRepository.addHistory(tx, { requestId: created.id, fromStage: null, toStage: "PENDING", actorId: userId, actorRole: "APPLICANT", note: "ส่งคำขอรับเลี้ยง" });
      await notify(tx, [{ recipientId: pet.ownerId, kind: "NEW_REQUEST", requestId: created.id }]);
      await syncPetStatus(petId, tx);
      return adoptionsRepository.get(created.id, tx);
    });
  },

  // PENDING: ลบแถวแบบเดิม (ยื่นใหม่ได้) · หลังเจ้าของตอบรับ (เปิด workflow): เปลี่ยนเป็น CANCELLED เก็บประวัติไว้
  cancel(userId: string, id: number): Promise<void> {
    return prisma.$transaction(async (tx) => {
      const request = await findRequestOr404(id, tx);
      if (request.userId !== userId) throw new ApiError(403, "ยกเลิกได้เฉพาะคำขอของตัวเอง");
      const alreadyReviewed = new ApiError(400, "คำขอนี้ถูกพิจารณาไปแล้ว ยกเลิกไม่ได้");
      if (request.stage === "PENDING") {
        // สถานะอาจเปลี่ยนระหว่างอ่านกับลบ (เจ้าของกดอนุมัติพร้อมกัน) → ลบแบบมีเงื่อนไข แล้วเช็คจำนวนแถว
        if ((await adoptionsRepository.deletePending(id, tx)) === 0) throw alreadyReviewed;
      } else if (env.ADOPTION_HANDOVER_WORKFLOW && !request.legacyReview && ["ACCEPTED", "ARRANGING_HANDOVER"].includes(request.stage)) {
        if (!(await adoptionsRepository.moveStage(id, ["ACCEPTED", "ARRANGING_HANDOVER"], "CANCELLED", tx, { legacyReview: false }))) throw conflict();
        await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: request.stage, toStage: "CANCELLED", actorId: userId, actorRole: "APPLICANT", note: "ผู้ขอยกเลิกคำขอ" });
        await notify(tx, [{ recipientId: request.pet.ownerId, kind: "REQUEST_CANCELLED", requestId: id }]);
      } else {
        throw alreadyReviewed;
      }
      await syncPetStatus(request.petId, tx);
    });
  },

  // PATCH /adoptions/:id (สัญญาเดิม) — APPROVED = เจ้าของตอบรับ, REJECTED = ปฏิเสธ
  review(userId: string, id: number, status: ReviewStatus): Promise<AdoptionRequest> {
    return prisma
      .$transaction(async (tx) => {
        const request = await findRequestOr404(id, tx);
        if (request.pet.ownerId !== userId) throw new ApiError(403, "พิจารณาได้เฉพาะเจ้าของโพสต์");
        const notPending = new ApiError(400, "คำขอนี้ถูกพิจารณาหรือถูกยกเลิกไปแล้ว");
        if (request.stage !== "PENDING") throw notPending;

        if (status === "REJECTED") {
          if (!(await adoptionsRepository.moveStage(id, ["PENDING"], "REJECTED", tx))) throw notPending;
          await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "PENDING", toStage: "REJECTED", actorId: userId, actorRole: "OWNER", note: "เจ้าของปฏิเสธคำขอ" });
          await notify(tx, [{ recipientId: request.userId, kind: "REQUEST_REJECTED", requestId: id }]);
        } else if (env.ADOPTION_HANDOVER_WORKFLOW) {
          // ตอบรับ ≠ ได้บ้านแล้ว: น้องยังเป็น PENDING จนส่งมอบเสร็จ · คำขออื่นยังรออยู่ (เจ้าของปฏิเสธเองได้)
          if (!(await adoptionsRepository.moveStage(id, ["PENDING"], "ACCEPTED", tx))) throw notPending;
          await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "PENDING", toStage: "ACCEPTED", actorId: userId, actorRole: "OWNER", note: "เจ้าของตอบรับคำขอ" });
          await notify(tx, [{ recipientId: request.userId, kind: "REQUEST_ACCEPTED", requestId: id }]);
        } else {
          // โหมดเดิม: น้องเป็น ADOPTED ทันทีเหมือนก่อน แต่ไม่มีหลักฐานส่งมอบ → legacy_review ให้ผู้ดูแลยืนยัน (ไม่ใช่ COMPLETED)
          const moved = await adoptionsRepository.moveStage(id, ["PENDING"], "ACCEPTED", tx, {}, { legacyReview: true, followUpRequired: true });
          if (!moved) throw notPending;
          await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "PENDING", toStage: "ACCEPTED", actorId: userId, actorRole: "OWNER", note: "เจ้าของอนุมัติ (ระบบเดิม) · รอผู้ดูแลยืนยันการส่งมอบ" });
          const rejected = await adoptionsRepository.rejectOtherPending(request.petId, id, "เจ้าของอนุมัติผู้ขอรายอื่นแล้ว", tx);
          await notify(tx, [
            { recipientId: request.userId, kind: "REQUEST_ACCEPTED", requestId: id },
            ...rejected.map((r) => ({ recipientId: r.userId, kind: "REQUEST_REJECTED" as const, requestId: r.id })),
          ]);
        }
        await syncPetStatus(request.petId, tx);
        return adoptionsRepository.get(id, tx);
      })
      .catch(translatePlacementConflict);
  },

  arrange(userId: string, id: number): Promise<AdoptionRequest> {
    requireHandoverWorkflow();
    return prisma.$transaction(async (tx) => {
      const request = await findRequestOr404(id, tx);
      if (request.pet.ownerId !== userId) throw new ApiError(403, "เริ่มนัดส่งมอบได้เฉพาะเจ้าของโพสต์");
      requireNotLegacy(request);
      if (request.stage !== "ACCEPTED") throw new ApiError(400, "เริ่มนัดส่งมอบได้หลังเจ้าของตอบรับคำขอเท่านั้น");
      if (!(await adoptionsRepository.moveStage(id, ["ACCEPTED"], "ARRANGING_HANDOVER", tx, { legacyReview: false }))) throw conflict();
      await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "ACCEPTED", toStage: "ARRANGING_HANDOVER", actorId: userId, actorRole: "OWNER", note: "เริ่มนัดส่งมอบ" });
      await notify(tx, [{ recipientId: request.userId, kind: "HANDOVER_ARRANGED", requestId: id }]);
      return adoptionsRepository.get(id, tx);
    });
  },

  // รายงานใหม่ล้างการยืนยันเดิมทั้งสองฝ่าย · ข้อมูลสองฝ่ายขัดกัน → ข้อพิพาท เข้าคิวผู้ดูแล · ไม่เปลี่ยนน้องเป็น ADOPTED
  report(userId: string, id: number, input: HandoverReportInput): Promise<AdoptionRequest> {
    requireHandoverWorkflow();
    return prisma.$transaction(async (tx) => {
      const request = await findRequestOr404(id, tx);
      const party = partyOf(request, userId);
      requireNotLegacy(request);
      if (request.stage !== "ARRANGING_HANDOVER" && request.stage !== "HANDOVER_REPORTED") {
        throw new ApiError(400, "รายงานส่งมอบได้หลังเริ่มนัดส่งมอบเท่านั้น");
      }
      if (input.evidenceUrl && !isOwnUpload(input.evidenceUrl, userId)) throw new ApiError(400, "หลักฐานต้องเป็นรูปที่คุณอัปโหลดผ่าน PawHome");
      const version = request.handoverVersion + 1;
      const moved = await adoptionsRepository.moveStage(
        id, ["ARRANGING_HANDOVER", "HANDOVER_REPORTED"], "HANDOVER_REPORTED", tx,
        { handoverVersion: request.handoverVersion },
        { handoverVersion: version, ownerConfirmedAt: null, applicantConfirmedAt: null },
      );
      if (!moved) throw conflict();
      await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: request.stage, toStage: "HANDOVER_REPORTED", actorId: userId, actorRole: party, note: "บันทึกรายงานส่งมอบ" });
      await adoptionsRepository.addReport(tx, { requestId: id, party, ...input, version, reporterId: userId });
      await notify(tx, [{ recipientId: otherParty(request, party), kind: "HANDOVER_REPORTED", requestId: id }]);

      const { owner, applicant } = await adoptionsRepository.latestReports(id, tx);
      if (reportsConflict(owner, applicant) && !request.disputed) {
        await adoptionsRepository.updateWhere(id, {}, { disputed: true, followUpRequired: true }, tx);
        await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "HANDOVER_REPORTED", toStage: "HANDOVER_REPORTED", actorId: null, actorRole: "SYSTEM", note: "รายงานสองฝ่ายไม่ตรงกัน · ต้องให้ผู้ดูแลตรวจสอบ" });
        await notify(tx, [request.userId, request.pet.ownerId].map((recipientId) => ({ recipientId, kind: "HANDOVER_DISPUTED" as const, requestId: id })));
      }
      return adoptionsRepository.get(id, tx);
    });
  },

  // ยืนยันได้ครั้งเดียวต่อรายงานชุดล่าสุด (handover_version) · สองฝ่ายยืนยันครบและไม่มีข้อพิพาท → COMPLETED + น้อง ADOPTED
  confirm(userId: string, id: number): Promise<AdoptionRequest> {
    requireHandoverWorkflow();
    return prisma
      .$transaction(async (tx) => {
        const request = await findRequestOr404(id, tx);
        const party = partyOf(request, userId);
        if (request.stage !== "HANDOVER_REPORTED") throw new ApiError(400, "ยังไม่มีรายงานส่งมอบให้ยืนยัน");
        const { owner, applicant } = await adoptionsRepository.latestReports(id, tx);
        if (!reportsMatch(owner, applicant)) throw new ApiError(400, "ยืนยันได้เมื่อรายงานสองฝ่ายตรงกัน (ส่งมอบแล้ว + วันที่เดียวกัน)");

        const confirmedField = party === "OWNER" ? "ownerConfirmedAt" : "applicantConfirmedAt";
        const confirmed = await adoptionsRepository.updateWhere(
          id,
          { stage: "HANDOVER_REPORTED", handoverVersion: request.handoverVersion, [confirmedField]: null },
          { [confirmedField]: new Date() },
          tx,
        );
        if (!confirmed) throw new ApiError(409, "ยืนยันรายงานชุดนี้ไปแล้ว หรือมีรายงานใหม่ กรุณาโหลดหน้าใหม่");
        await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "HANDOVER_REPORTED", toStage: "HANDOVER_REPORTED", actorId: userId, actorRole: party, note: "ยืนยันรายละเอียดส่งมอบ" });
        await notify(tx, [{ recipientId: otherParty(request, party), kind: "HANDOVER_CONFIRMED", requestId: id }]);

        // อีกฝ่ายอาจยืนยันพร้อมกัน: เงื่อนไขเช็คในคำสั่งเดียว ใครมาทีหลังเป็นคนปิดขั้น
        const completed = await adoptionsRepository.moveStage(
          id, ["HANDOVER_REPORTED"], "COMPLETED", tx,
          { handoverVersion: request.handoverVersion, disputed: false, ownerConfirmedAt: { not: null }, applicantConfirmedAt: { not: null } },
          { completedAt: new Date() },
        );
        if (completed) {
          await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "HANDOVER_REPORTED", toStage: "COMPLETED", actorId: null, actorRole: "SYSTEM", note: "ยืนยันส่งมอบครบสองฝ่าย · รับเลี้ยงสำเร็จ" });
          const rejected = await adoptionsRepository.rejectOtherPending(request.petId, id, "น้องได้บ้านแล้ว", tx);
          await notify(tx, [
            ...[request.userId, request.pet.ownerId].map((recipientId) => ({ recipientId, kind: "ADOPTION_COMPLETED" as const, requestId: id })),
            ...rejected.map((r) => ({ recipientId: r.userId, kind: "REQUEST_REJECTED" as const, requestId: r.id })),
          ]);
          await syncPetStatus(request.petId, tx);
        }
        return adoptionsRepository.get(id, tx);
      })
      .catch(translatePlacementConflict);
  },

  dispute(userId: string, id: number, input: DisputeInput): Promise<AdoptionRequest> {
    requireHandoverWorkflow();
    return prisma.$transaction(async (tx) => {
      const request = await findRequestOr404(id, tx);
      const party = partyOf(request, userId);
      if (request.stage !== "HANDOVER_REPORTED") throw new ApiError(400, "แจ้งข้อพิพาทได้หลังมีรายงานส่งมอบเท่านั้น");
      if (!(await adoptionsRepository.updateWhere(id, { stage: "HANDOVER_REPORTED", disputed: false }, { disputed: true, followUpRequired: true }, tx))) {
        throw new ApiError(409, "คำขอนี้มีการแจ้งข้อพิพาทอยู่แล้ว");
      }
      await adoptionsRepository.addHistory(tx, { requestId: id, fromStage: "HANDOVER_REPORTED", toStage: "HANDOVER_REPORTED", actorId: userId, actorRole: party, note: `แจ้งข้อพิพาท: ${input.note}` });
      await notify(tx, [{ recipientId: otherParty(request, party), kind: "HANDOVER_DISPUTED", requestId: id }]);
      return adoptionsRepository.get(id, tx);
    });
  },
};
