// กฎขั้นตอนรับเลี้ยง (ฟังก์ชันล้วน ไม่แตะฐานข้อมูล) — ตรงกับ frontend/src/admin/workflow.ts
// ไม่มีการเปลี่ยนขั้นอัตโนมัติตามเวลา: เวลาใช้คำนวณความเร่งด่วนของคิวติดตามเท่านั้น
import type { AdoptionStatus, PetStatus } from "../types/dto.js";

export const STAGES = ["PENDING", "ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED", "COMPLETED", "REJECTED", "CANCELLED"] as const;
export type Stage = (typeof STAGES)[number];

// เจ้าของตอบรับแล้ว (น้องหนึ่งตัวมีได้คำขอเดียว — unique index บน status = APPROVED)
export const PLACED_STAGES = ["ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED", "COMPLETED"] as const satisfies readonly Stage[];
export const ACTIVE_STAGES = ["PENDING", "ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED"] as const satisfies readonly Stage[];

export const isTerminal = (stage: string) => stage === "COMPLETED" || stage === "REJECTED" || stage === "CANCELLED";

// status เดิมที่ API สาธารณะส่งให้หน้าเว็บ (constraint ในฐานข้อมูลบังคับให้ตรงกันเสมอ)
export function statusOfStage(stage: Stage): AdoptionStatus {
  if (stage === "PENDING") return "PENDING";
  if (stage === "REJECTED" || stage === "CANCELLED") return stage;
  return "APPROVED";
}

// สถานะน้อง: รับเลี้ยงสำเร็จ (หรืออนุมัติจากระบบเดิมที่รอผู้ดูแลตรวจ) = ได้บ้านแล้ว · มีคำขอที่ยังไม่จบ = มีคนขอ · ไม่มี = รอบ้าน
export function derivePetStatus(requests: { stage: string; legacyReview: boolean }[]): PetStatus {
  if (requests.some((r) => r.stage === "COMPLETED" || r.legacyReview)) return "ADOPTED";
  if (requests.some((r) => (ACTIVE_STAGES as readonly string[]).includes(r.stage))) return "PENDING";
  return "AVAILABLE";
}

export interface FollowUpPolicy {
  reminderHours: number;
  adminHours: number;
  escalationHours: number;
}

export type Priority = "normal" | "reminder" | "high" | "urgent";
const rank: Record<Priority, number> = { normal: 0, reminder: 1, high: 2, urgent: 3 };

export interface FollowUpInput {
  stage: string;
  lastActivityAt: Date;
  followUpRequired: boolean;
  disputed: boolean;
  legacyReview: boolean;
  closedAt: Date | null;
}

// เวลาเงียบนับเฉพาะตอนรอเจ้าของตอบ (PENDING) จาก last_activity_at ซึ่งเปลี่ยนเมื่อเปลี่ยนขั้นเท่านั้น
// → ผู้ดูแลบันทึกการติดต่อ/โน้ต ไม่ทำให้เวลาเงียบของเจ้าของเริ่มนับใหม่
export function followUp(item: FollowUpInput, now: Date, policy: FollowUpPolicy) {
  const hours = Math.max(0, Math.floor((now.getTime() - item.lastActivityAt.getTime()) / 3_600_000));
  const idle = item.stage === "PENDING" ? hours : 0;
  const open = !isTerminal(item.stage) && !item.closedAt;
  let priority: Priority = "normal";
  if (open) {
    if (item.disputed || idle >= policy.escalationHours) priority = "urgent";
    else if (item.followUpRequired || item.legacyReview || idle >= policy.adminHours) priority = "high";
    else if (idle >= policy.reminderHours) priority = "reminder";
  } else if (item.legacyReview && !item.closedAt) {
    priority = "high"; // ข้อมูลระบบเดิมที่ยังไม่ได้ตรวจ ต้องอยู่ในคิวเสมอ
  }
  return { hours, idle, overdue: open && idle >= policy.adminHours, priority, required: rank[priority] >= rank.high };
}

export interface HandoverReportInput {
  handoverDate: Date;
  outcome: string;
}

// รายงานสองฝ่ายตรงกัน = ทั้งคู่ "ส่งมอบแล้ว" และวันที่เดียวกัน
export function reportsMatch(owner?: HandoverReportInput | null, applicant?: HandoverReportInput | null) {
  return Boolean(
    owner && applicant && owner.outcome === "HANDED_OVER" && applicant.outcome === "HANDED_OVER" &&
      owner.handoverDate.getTime() === applicant.handoverDate.getTime(),
  );
}

// มีรายงานครบสองฝ่ายแต่ข้อมูลขัดกัน → ต้องให้ผู้ดูแลตรวจ
export function reportsConflict(owner?: HandoverReportInput | null, applicant?: HandoverReportInput | null) {
  return Boolean(
    owner && applicant &&
      (owner.outcome !== applicant.outcome || owner.handoverDate.getTime() !== applicant.handoverDate.getTime()),
  );
}
