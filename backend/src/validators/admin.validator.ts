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
    kind: z.enum(["FLAG", "UNFLAG", "CONTACT", "NOTE", "RESOLVE"], { errorMap: () => ({ message: "kind ไม่ถูกต้อง" }) }),
    note: optionalNote,
  })
  .refine((v) => !["CONTACT", "NOTE"].includes(v.kind) || v.note.length > 0, { message: "กรุณากรอกรายละเอียด", path: ["note"] });

export const escalateSchema = z.object({ note: optionalNote });
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
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
});

export const suspendSchema = z.object({ reason: reason("เหตุผลที่ระงับบัญชี").pipe(z.string().max(500)) });

export const adminRoleSchema = z.object({
  role: z.enum(["ADMIN", "SUPER_ADMIN"], { errorMap: () => ({ message: "role ต้องเป็น ADMIN หรือ SUPER_ADMIN" }) }),
});

// ปลายทางในเว็บเท่านั้น ("/" หรือ "/path") — ตรงกับ check constraint ในฐานข้อมูล
export const SAFE_DESTINATION = /^\/([A-Za-z0-9._~-][A-Za-z0-9._~/?=&#%-]*)?$/;

const announcementFields = {
  title: z.string({ required_error: "กรุณากรอกชื่อประกาศ" }).trim().min(1, "กรุณากรอกชื่อประกาศ").max(200),
  category: z.string().trim().max(60).default(""),
  description: z.string().trim().max(5000).default(""),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD").nullable().default(null),
  eventTime: z.string().trim().max(60).default(""),
  location: z.string().trim().max(300).default(""),
  contact: z.string().trim().max(500).default(""),
  cta: z.string().trim().max(60).default(""),
  destination: z.string().trim().regex(SAFE_DESTINATION, "ปลายทางต้องเป็นลิงก์ภายในเว็บ เช่น /pets").default("/"),
  imageUrl: z.string().trim().max(2048).default(""),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  displayOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  isDemo: z.boolean().default(false),
  // ตั้งเวลาเผยแพร่ / หมดอายุ (ISO datetime) · null = ไม่กำหนด
  publishAt: z.string().datetime({ offset: true, message: "publishAt ต้องเป็นวันเวลา ISO" }).nullable().default(null),
  expireAt: z.string().datetime({ offset: true, message: "expireAt ต้องเป็นวันเวลา ISO" }).nullable().default(null),
};

const windowOk = (v: { publishAt?: string | null; expireAt?: string | null }) => !v.publishAt || !v.expireAt || new Date(v.expireAt) > new Date(v.publishAt);
export const announcementCreateSchema = z.object(announcementFields).refine(windowOk, { message: "วันหมดอายุต้องหลังวันเผยแพร่", path: ["expireAt"] });
// PATCH: ส่งเฉพาะฟิลด์ที่จะแก้ — optional ข้าม default ของฟิลด์ที่ไม่ได้ส่ง (ไม่เขียนทับเป็นค่าเริ่มต้น)
export const announcementUpdateSchema = z.object(announcementFields)
  .partial()
  .refine(windowOk, { message: "วันหมดอายุต้องหลังวันเผยแพร่", path: ["expireAt"] })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "ไม่มีข้อมูลที่จะแก้ไข" });

export const reportRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from ต้องเป็น YYYY-MM-DD").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to ต้องเป็น YYYY-MM-DD").optional(),
  })
  .transform(({ from, to }) => {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 30 * 86_400_000);
    return { start, end };
  })
  .refine((r) => r.start <= r.end, { message: "from ต้องไม่เกิน to" });

export const auditFiltersSchema = z.object({
  page,
  limit,
  action: z.string().trim().max(100).optional(),
  targetType: z.string().trim().max(50).optional(),
  targetId: z.string().trim().max(100).optional(),
});

export type CaseFilters = z.infer<typeof caseFiltersSchema>;
export type FollowUpInput = z.infer<typeof followUpSchema>;
export type ReviewHandoverInput = z.infer<typeof reviewHandoverSchema>;
export type PetFiltersAdmin = z.infer<typeof petFiltersAdminSchema>;
export type ModerationInput = z.infer<typeof moderationSchema>;
export type UserFilters = z.infer<typeof userFiltersSchema>;
export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>;
export type AnnouncementUpdate = z.infer<typeof announcementUpdateSchema>;
export type ReportRange = z.infer<typeof reportRangeSchema>;
