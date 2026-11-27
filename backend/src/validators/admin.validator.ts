import { z } from "zod";
import { STAGES } from "../services/adoption-workflow.js";

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const limit = z.coerce.number().int().min(1).max(200).default(20);
const q = z.string().trim().max(100).optional().transform((v) => v || undefined);

const reason = (label: string, min = 5) =>
  z.string({ required_error: `กรุณาระบุ${label}` }).trim().min(min, `${label}อย่างน้อย ${min} ตัวอักษร`).max(2000, `${label}ยาวเกิน 2000 ตัวอักษร`);
const optionalNote = z.string().trim().max(2000, "บันทึกยาวเกิน 2000 ตัวอักษร").default("");

export const pageSchema = z.object({ page, limit });

export const caseFiltersSchema = z.object({
  page,
  limit,
  q,
  stage: z.enum(STAGES).optional(),
  priority: z.enum(["normal", "reminder", "high", "urgent"]).optional(),
  queue: z.enum(["follow-up", "overdue", "disputed", "legacy"]).optional(),
  sort: z.enum(["newest", "priority"]).default("newest"),
});

export const followUpSchema = z
  .object({
    kind: z.enum(["FLAG", "UNFLAG", "NOTE", "RESOLVE"], { errorMap: () => ({ message: "kind ไม่ถูกต้อง" }) }),
    note: optionalNote,
  })
  .refine((v) => v.kind !== "NOTE" || v.note.length > 0, { message: "กรุณากรอกรายละเอียด", path: ["note"] });

export const closeSchema = z.object({ note: optionalNote });

export const reviewHandoverSchema = z.object({
  decision: z.enum(["COMPLETE", "VERIFY", "MARK_DISPUTED", "REOPEN"], { errorMap: () => ({ message: "decision ไม่ถูกต้อง" }) }),
  note: reason("ผลตรวจสอบและหลักฐาน"),
});

export const petFiltersAdminSchema = z.object({
  page,
  limit,
  q,
  visibility: z.enum(["VISIBLE", "HIDDEN", "CHANGES_REQUESTED", "REVIEW"]).optional(),
});

export const petVisibilitySchema = z.object({
  visibility: z.enum(["VISIBLE", "HIDDEN"], { errorMap: () => ({ message: "visibility ต้องเป็น VISIBLE หรือ HIDDEN" }) }),
  reason: optionalNote,
});

export const moderationSchema = z
  .object({
    decision: z.enum(["APPROVE", "REQUEST_CHANGES"], { errorMap: () => ({ message: "decision ต้องเป็น APPROVE หรือ REQUEST_CHANGES" }) }),
    reason: z.string().trim().max(500, "เหตุผลยาวเกิน 500 ตัวอักษร").default(""),
  })
  .refine((v) => v.decision === "APPROVE" || v.reason.length >= 5, { message: "กรุณาระบุเหตุผลที่ส่งกลับให้แก้ไขอย่างน้อย 5 ตัวอักษร", path: ["reason"] });

export const userFiltersSchema = z.object({
  page,
  limit,
  q,
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
});

export type CaseFilters = z.infer<typeof caseFiltersSchema>;
export type FollowUpInput = z.infer<typeof followUpSchema>;
export type ReviewHandoverInput = z.infer<typeof reviewHandoverSchema>;
export type PetFiltersAdmin = z.infer<typeof petFiltersAdminSchema>;
export type ModerationInput = z.infer<typeof moderationSchema>;
export type UserFilters = z.infer<typeof userFiltersSchema>;
