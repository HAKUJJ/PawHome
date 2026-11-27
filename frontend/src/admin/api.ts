// =========================================================
// Real Admin Mode: เรียก /api/admin/* ผ่าน api/client.ts เดิม (แนบ token + ต่ออายุอัตโนมัติ + 401 → ออกจากระบบ)
// แล้วแปลงเป็นรูปแบบของ store เพื่อใช้หน้าจอเดิมทั้งหมด
// role ไม่เคยเก็บฝั่งหน้าเว็บ: ทุกครั้งที่เปิด Admin ต้องผ่าน GET /admin/me จาก Backend ก่อน
// =========================================================
import { request } from "../api/client";
import type { Sex, Species } from "../types/pet";
import type { PreviewPet, PreviewUser, Visibility } from "./store";
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
  followUpRequired: boolean; disputed: boolean; legacyReview: boolean; closedAt: string | null;
  completedAt: string | null; verifiedAt: string | null; resolution: string;
  reports: { owner: ApiReport | null; applicant: ApiReport | null }; confirmations: { owner: boolean; applicant: boolean };
}
export interface ApiUser { id: string; name: string; role: "USER" | "ADMIN" | "SUPER_ADMIN"; joinedAt: string }
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
  flagged: c.followUpRequired || c.legacyReview, disputed: c.disputed, closed: Boolean(c.closedAt),
  verified: Boolean(c.verifiedAt), resolution: c.resolution || undefined, completedAt: c.completedAt ? ms(c.completedAt) : undefined,
  legacy: c.legacyReview,
  reports: { owner: toHandover(c.reports.owner), applicant: toHandover(c.reports.applicant) },
  confirmations: { owner: c.confirmations.owner, applicant: c.confirmations.applicant },
  timeline,
});

export const toUser = (u: ApiUser): PreviewUser => ({
  id: u.id, name: u.name, role: u.role === "USER" ? "member" : "admin", joinedAt: ms(u.joinedAt), province: "–",
});



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
  timeline: (id: number) => request<ApiEvent[]>(`/admin/adoptions/${id}/timeline`),

  moderatePet: (id: number, decision: "APPROVE" | "REQUEST_CHANGES", reason = "") => request(`/admin/pets/${id}/moderation`, json("POST", { decision, reason })),
  setPetVisibility: (id: number, value: "VISIBLE" | "HIDDEN", reason = "") => request(`/admin/pets/${id}`, json("PATCH", { visibility: value, reason })),

  followUp: (id: number, kind: "FLAG" | "UNFLAG" | "CONTACT" | "NOTE" | "RESOLVE", note = "") => request(`/admin/adoptions/${id}/follow-ups`, json("POST", { kind, note })),
  reviewHandover: (id: number, decision: "COMPLETE" | "VERIFY" | "MARK_DISPUTED" | "REOPEN", note: string) =>
    request(`/admin/adoptions/${id}/review-handover`, json("POST", { decision, note })),
  closeCase: (id: number, note = "") => request(`/admin/adoptions/${id}/close`, json("POST", { note })),


};

