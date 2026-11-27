// =========================================================
// Type ของคำขอรับเลี้ยง — ตรงกับ model AdoptionRequest ใน schema.prisma
// 1 คนขอน้อง 1 ตัวได้ครั้งเดียว → @@unique([userId, petId])
// =========================================================

import type { Pet } from "./pet";

export type AdoptionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
// ขั้นตอนละเอียดจาก Backend (migration 001) · Backend/โหมดจำลองรุ่นเดิมไม่มี → ใช้ status แทน
export type AdoptionStage = "PENDING" | "ACCEPTED" | "ARRANGING_HANDOVER" | "HANDOVER_REPORTED" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type Housing = "HOUSE" | "CONDO" | "DORM";

export interface AdoptionRequest {
  id: number;
  petId: number;
  userId: string;
  userName: string;
  phone: string;
  housing: Housing;
  message: string;
  status: AdoptionStatus;
  createdAt: string;
  pet: Pet; // Backend include ข้อมูลน้องมาด้วย (ใช้ในหน้า "ของฉัน")
  // ---- ขั้นตอนส่งมอบ (มีเมื่อ Backend รุ่นใหม่ · ส่งเฉพาะเจ้าของ/ผู้ขอ) ----
  stage?: AdoptionStage;
  lastActivityAt?: string;
  disputed?: boolean;
  legacyReview?: boolean; // อนุมัติแบบเดิม รอผู้ดูแลยืนยันการส่งมอบ
  completedAt?: string | null;
  handover?: {
    owner: HandoverReport | null;
    applicant: HandoverReport | null;
    ownerConfirmed: boolean;
    applicantConfirmed: boolean;
  };
}

export interface HandoverReport {
  handoverDate: string; // YYYY-MM-DD
  outcome: "HANDED_OVER" | "NOT_HANDED_OVER";
  note: string;
  evidenceUrl: string;
  createdAt: string;
}

export type HandoverInput = Pick<HandoverReport, "handoverDate" | "outcome" | "note">;

export interface TimelineEntry {
  at: string;
  kind: "STAGE" | "REPORT";
  actorRole: "OWNER" | "APPLICANT" | "ADMIN" | "SYSTEM";
  label: string;
}

// ข้อมูลที่ผู้ขอกรอกในฟอร์ม
export type AdoptionInput = Pick<AdoptionRequest, "phone" | "housing" | "message">;

export const adoptionStatusLabel: Record<AdoptionStatus, string> = {
  PENDING: "รอผู้โพสต์พิจารณา",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่ผ่าน",
  CANCELLED: "ยกเลิกแล้ว",
};

export const adoptionStageLabel: Record<AdoptionStage, string> = {
  PENDING: "รอผู้โพสต์พิจารณา",
  ACCEPTED: "ผู้โพสต์ตอบรับแล้ว",
  ARRANGING_HANDOVER: "กำลังนัดส่งมอบ",
  HANDOVER_REPORTED: "แจ้งส่งมอบแล้ว รอยืนยัน",
  COMPLETED: "รับเลี้ยงสำเร็จ",
  REJECTED: "ไม่ผ่าน",
  CANCELLED: "ยกเลิกแล้ว",
};

// ป้ายที่แสดง: ขั้นตอนละเอียดถ้ามี · คำขออนุมัติแบบเดิม (รอผู้ดูแลยืนยัน) ยังแสดง "อนุมัติแล้ว"
export function adoptionLabel(r: Pick<AdoptionRequest, "status" | "stage" | "legacyReview">): string {
  if (!r.stage || r.legacyReview) return adoptionStatusLabel[r.status];
  return adoptionStageLabel[r.stage];
}

// ผู้ขอยกเลิกได้: ยังรอพิจารณา · หรือ (เปิดขั้นตอนส่งมอบ) ตอบรับแล้วแต่ยังไม่ได้รายงานส่งมอบ
export function canCancel(r: Pick<AdoptionRequest, "status" | "stage" | "legacyReview">, handoverEnabled: boolean): boolean {
  const stage = r.stage ?? (r.status === "PENDING" ? "PENDING" : "REJECTED");
  if (stage === "PENDING") return true;
  return handoverEnabled && !r.legacyReview && (stage === "ACCEPTED" || stage === "ARRANGING_HANDOVER");
}

export const housingLabel: Record<Housing, string> = {
  HOUSE: "บ้านเดี่ยว / ทาวน์เฮาส์",
  CONDO: "คอนโด / อพาร์ตเมนต์",
  DORM: "หอพัก",
};
