// =========================================================
// Real Admin Mode: เรียก /api/admin/* ผ่าน api/client.ts เดิม (แนบ token + ต่ออายุอัตโนมัติ + 401 → ออกจากระบบ)
// แล้วแปลงเป็นรูปแบบของ store เพื่อใช้หน้าจอเดิมทั้งหมด
// role ไม่เคยเก็บฝั่งหน้าเว็บ: ทุกครั้งที่เปิด Admin ต้องผ่าน GET /admin/me จาก Backend ก่อน
// =========================================================
import { request } from "../api/client";
import type { Sex, Species } from "../types/pet";
import type { Announcement, Audit, PreviewPet, PreviewUser, Visibility } from "./store";
import type { AdoptionCase, CaseEvent, Handover, Stage } from "./workflow";

// ---------- รูปแบบจาก Backend (ตรงกับ backend/src/types/admin.ts) ----------
export interface Paged<T> { items: T[]; total: number; page: number; limit: number }
export interface AdminMe {
  id: string; name: string; email: string; role: "ADMIN" | "SUPER_ADMIN"; permissions: string[];
  workflow: { handoverEnabled: boolean; reminderHours: number; adminHours: number; escalationHours: number };
}
type ApiVisibility = "VISIBLE" | "HIDDEN" | "CHANGES_REQUESTED" | "REVIEW";
export interface ApiPet {
  id: number; name: string; species: Species; breed: string; sex: Sex; ageMonths: number; province: string; description: string;
  imageUrl: string; vaccinated: boolean; sterilized: boolean; urgent: boolean; status: string; visibility: ApiVisibility;
  moderationReason: string; moderatedAt: string | null; ownerId: string; ownerName: string; createdAt: string;
}
interface ApiReport { party: "OWNER" | "APPLICANT"; handoverDate: string; outcome: "HANDED_OVER" | "NOT_HANDED_OVER"; note: string; evidenceUrl: string }
export interface ApiCase {
  id: number; petId: number; applicantId: string; applicantName: string; ownerId: string; ownerName: string; phone: string;
  housing: "HOUSE" | "CONDO" | "DORM"; message: string; stage: Stage; createdAt: string; lastActivityAt: string;
  followUpRequired: boolean; escalated: boolean; disputed: boolean; legacyReview: boolean; closedAt: string | null;
  completedAt: string | null; verifiedAt: string | null; resolution: string;
  reports: { owner: ApiReport | null; applicant: ApiReport | null }; confirmations: { owner: boolean; applicant: boolean };
}
export interface ApiUser { id: string; name: string; role: "USER" | "ADMIN" | "SUPER_ADMIN"; suspended: boolean; suspendedReason: string; joinedAt: string }
export interface ApiAnnouncement {
  id: number; title: string; category: string; description: string; eventDate: string | null; eventTime: string; location: string;
  contact: string; cta: string; destination: string; imageUrl: string; status: "DRAFT" | "PUBLISHED"; displayOrder: number; isDemo: boolean;
}
export interface ApiAudit { id: string; actorName: string; action: string; targetType: string; targetId: string; reason: string; createdAt: string }
interface ApiEvent { at: string; kind: string; actorRole: string; actorName: string; label: string; note: string }

// ---------- แปลงเป็นรูปแบบของหน้าจอ ----------
const ms = (iso: string) => new Date(iso).getTime();
export const caseKey = (id: number) => `AD-${id}`;
// "AD-12" → 12 · รหัสที่ไม่ใช่รูปแบบนี้ = ไม่มีเคสนี้
export function caseNumber(key: string): number {
  const match = /^AD-(\d+)$/.exec(key);
  if (!match) throw new Error(`รหัสเคสไม่ถูกต้อง: ${key}`);
  return Number(match[1]);
}

const visibility: Record<ApiVisibility, Visibility> = { VISIBLE: "visible", HIDDEN: "hidden", REVIEW: "review", CHANGES_REQUESTED: "changes" };
const housing = { HOUSE: "บ้านเดี่ยว", CONDO: "คอนโด", DORM: "หอพัก" } as const;

export const toPet = (p: ApiPet): PreviewPet => ({
  id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, ageMonths: p.ageMonths, province: p.province, ownerId: p.ownerId,
  imageUrl: p.imageUrl, visibility: visibility[p.visibility], createdAt: ms(p.createdAt), description: p.description,
  vaccinated: p.vaccinated, sterilized: p.sterilized, reviewNote: p.moderationReason || undefined,
});

const toHandover = (r: ApiReport | null): Handover | undefined =>
  r ? { date: r.handoverDate, status: r.outcome === "HANDED_OVER" ? "delivered" : "failed", note: r.note, evidence: Boolean(r.evidenceUrl), evidenceUrl: r.evidenceUrl || undefined } : undefined;

export const toCase = (c: ApiCase, timeline: CaseEvent[] = []): AdoptionCase => ({
  id: caseKey(c.id), petId: c.petId, applicantId: c.applicantId, stage: c.stage, createdAt: ms(c.createdAt), activityAt: ms(c.lastActivityAt),
  contact: c.phone, message: c.message, housing: housing[c.housing] ?? c.housing,
  // ข้อมูลระบบเดิมที่รอตรวจ ต้องอยู่ในคิวติดตามเสมอ
  flagged: c.followUpRequired || c.legacyReview, disputed: c.disputed, escalated: c.escalated, closed: Boolean(c.closedAt),
  verified: Boolean(c.verifiedAt), resolution: c.resolution || undefined, completedAt: c.completedAt ? ms(c.completedAt) : undefined,
  legacy: c.legacyReview,
  reports: { owner: toHandover(c.reports.owner), applicant: toHandover(c.reports.applicant) },
  confirmations: { owner: c.confirmations.owner, applicant: c.confirmations.applicant },
  timeline,
});

export const toUser = (u: ApiUser): PreviewUser => ({
  id: u.id, name: u.name, role: u.role === "USER" ? "member" : "admin", suspended: u.suspended, joinedAt: ms(u.joinedAt), province: "–",
});

export const toAnnouncement = (a: ApiAnnouncement): Announcement => ({
  id: String(a.id), title: a.title, category: a.category, description: a.description, date: a.eventDate ?? "", time: a.eventTime,
  location: a.location, contact: a.contact, cta: a.cta, destination: a.destination, published: a.status === "PUBLISHED", order: a.displayOrder,
});

const actionLabel: Record<string, string> = {
  "pet.approve": "อนุมัติโพสต์", "pet.request_changes": "ส่งโพสต์กลับไปแก้ไข", "pet.hide": "ซ่อนโพสต์", "pet.show": "แสดงโพสต์",
  "adoption.flag": "ตั้งธงต้องติดตาม", "adoption.unflag": "นำธงต้องติดตามออก", "adoption.contact": "บันทึกการติดต่อ", "adoption.note": "เพิ่มบันทึกติดตาม",
  "adoption.escalate": "ส่งต่อเคสเร่งด่วน", "adoption.resolve": "ติดตามเสร็จแล้ว", "adoption.dispute": "ทำเครื่องหมายข้อพิพาท",
  "adoption.verify": "ยืนยันผลตรวจสอบ", "adoption.reopen": "เปิดเคสให้ดำเนินการต่อ", "adoption.close": "ปิดเคส",
  "user.suspend": "ระงับบัญชี", "user.unsuspend": "เปิดใช้งานบัญชี", "admin.set_role": "เปลี่ยนสิทธิ์ผู้ดูแล", "admin.revoke": "ถอดสิทธิ์ผู้ดูแล",
  "admin.bootstrap_super_admin": "แต่งตั้งผู้ดูแลสูงสุดคนแรก",
  "announcement.create": "สร้างประกาศ", "announcement.update": "แก้ไขประกาศ", "announcement.publish": "เผยแพร่ประกาศ",
  "announcement.unpublish": "ยกเลิกการเผยแพร่", "announcement.delete": "ลบประกาศ", "permission.denied": "พยายามทำเกินสิทธิ์",
};
const category: Record<string, Audit["category"]> = { adoption_request: "เคส", pet: "สัตว์เลี้ยง", user: "ผู้ใช้", announcement: "ประกาศ" };

export function toAudit(entry: ApiAudit, names: { pets: Map<string, string>; users: Map<string, string>; announcements: Map<string, string> }): Audit {
  const target = entry.targetType === "adoption_request" ? caseKey(Number(entry.targetId))
    : entry.targetType === "pet" ? names.pets.get(entry.targetId) ?? `โพสต์ #${entry.targetId}`
    : entry.targetType === "user" ? names.users.get(entry.targetId) ?? "ผู้ใช้"
    : entry.targetType === "announcement" ? names.announcements.get(entry.targetId) ?? `ประกาศ #${entry.targetId}`
    : entry.targetId || entry.targetType;
  return {
    id: entry.id, actor: entry.actorName, action: actionLabel[entry.action] ?? entry.action, target, at: ms(entry.createdAt),
    category: category[entry.targetType] ?? "ระบบ", note: entry.reason || undefined,
  };
}

const actor = (role: string): CaseEvent["actor"] => (role === "OWNER" ? "owner" : role === "APPLICANT" ? "applicant" : "admin");
export const toEvent = (e: ApiEvent): CaseEvent => ({ actor: actor(e.actorRole), label: e.label, at: ms(e.at), note: e.note || undefined });

// ---------- เรียก API ----------
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// shortcut: โหลดทุกหน้าไว้ในหน่วยความจำเพื่อใช้ตัวกรอง/เรียงเดิมของหน้าจอ (สูงสุด 20 × 200 แถว), ถ้าข้อมูลเกินให้ย้ายตัวกรองไปฝั่ง Backend
async function all<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await request<Paged<T>>(`${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=200`);
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) break;
  }
  return items;
}

export const adminApi = {
  me: () => request<AdminMe>("/admin/me"),
  pets: () => all<ApiPet>("/admin/pets"),
  cases: () => all<ApiCase>("/admin/adoptions"),
  users: () => all<ApiUser>("/admin/users"),
  announcements: () => request<ApiAnnouncement[]>("/admin/announcements"),
  auditLogs: (limit = 50) => request<Paged<ApiAudit>>(`/admin/audit-logs?limit=${limit}`),
  timeline: (id: number) => request<ApiEvent[]>(`/admin/adoptions/${id}/timeline`),

  moderatePet: (id: number, decision: "APPROVE" | "REQUEST_CHANGES", reason = "") => request(`/admin/pets/${id}/moderation`, json("POST", { decision, reason })),
  setPetVisibility: (id: number, value: "VISIBLE" | "HIDDEN", reason = "") => request(`/admin/pets/${id}`, json("PATCH", { visibility: value, reason })),

  followUp: (id: number, kind: "FLAG" | "UNFLAG" | "CONTACT" | "NOTE" | "RESOLVE", note = "") => request(`/admin/adoptions/${id}/follow-ups`, json("POST", { kind, note })),
  escalate: (id: number, note = "") => request(`/admin/adoptions/${id}/escalate`, json("POST", { note })),
  reviewHandover: (id: number, decision: "COMPLETE" | "VERIFY" | "MARK_DISPUTED" | "REOPEN", note: string) =>
    request(`/admin/adoptions/${id}/review-handover`, json("POST", { decision, note })),
  closeCase: (id: number, note = "") => request(`/admin/adoptions/${id}/close`, json("POST", { note })),

  suspend: (id: string, reason: string) => request(`/admin/users/${id}/suspension`, json("POST", { reason })),
  unsuspend: (id: string) => request(`/admin/users/${id}/suspension`, { method: "DELETE" }),

  createAnnouncement: (a: Announcement) => request(`/admin/announcements`, json("POST", fromAnnouncement(a))),
  updateAnnouncement: (id: string, patch: Partial<ReturnType<typeof fromAnnouncement>>) => request(`/admin/announcements/${id}`, json("PATCH", patch)),
  deleteAnnouncement: (id: string) => request(`/admin/announcements/${id}`, { method: "DELETE" }),
};

export function fromAnnouncement(a: Announcement) {
  return {
    title: a.title, category: a.category, description: a.description, eventDate: a.date || null, eventTime: a.time, location: a.location,
    contact: a.contact, cta: a.cta, destination: a.destination || "/", status: a.published ? ("PUBLISHED" as const) : ("DRAFT" as const), displayOrder: a.order,
  };
}
