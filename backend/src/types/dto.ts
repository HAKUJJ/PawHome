// รูปแบบข้อมูลที่ส่งให้หน้าเว็บ — ต้องตรงกับ frontend/src/types/*.ts

export type Species = "DOG" | "CAT" | "OTHER";
export type Sex = "MALE" | "FEMALE";
export type PetStatus = "AVAILABLE" | "PENDING" | "ADOPTED";
export type Housing = "HOUSE" | "CONDO" | "DORM";
// CANCELLED = ยกเลิกหลังเจ้าของตอบรับแล้ว (มีเฉพาะเมื่อเปิด ADOPTION_HANDOVER_WORKFLOW)
export type AdoptionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type AdoptionStage = "PENDING" | "ACCEPTED" | "ARRANGING_HANDOVER" | "HANDOVER_REPORTED" | "COMPLETED" | "REJECTED" | "CANCELLED";
export type PetVisibility = "VISIBLE" | "HIDDEN" | "CHANGES_REQUESTED" | "REVIEW";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Pet {
  id: number;
  name: string;
  species: Species;
  breed: string;
  ageMonths: number;
  sex: Sex;
  province: string;
  imageUrl: string;
  description: string;
  vaccinated: boolean;
  sterilized: boolean;
  urgent: boolean;
  status: PetStatus;
  createdAt: string;
  ownerId: string;
  ownerName: string;
  // ผลตรวจโพสต์ (เพิ่มใน migration 001) — คนทั่วไปเห็นเฉพาะ VISIBLE · เจ้าของเห็นเหตุผลที่ถูกส่งกลับแก้ไข
  visibility: PetVisibility;
  moderationReason: string;
}

// รายงานส่งมอบล่าสุดของแต่ละฝ่าย — ส่งเฉพาะ endpoint ของเจ้าของ/ผู้ขอ (ไม่อยู่ใน API สาธารณะ)
export interface HandoverReport {
  handoverDate: string; // YYYY-MM-DD
  outcome: "HANDED_OVER" | "NOT_HANDED_OVER";
  note: string;
  evidenceUrl: string;
  createdAt: string;
}

export interface AdoptionRequest {
  id: number;
  petId: number;
  userId: string;
  userName: string;
  phone: string;
  housing: Housing;
  message: string;
  status: AdoptionStatus;
  stage: AdoptionStage; // ขั้นตอนละเอียด (เพิ่มใน migration 001) · status เดิมยังส่งเหมือนเดิม
  createdAt: string;
  lastActivityAt: string;
  disputed: boolean;
  legacyReview: boolean; // อนุมัติจากระบบเดิม รอผู้ดูแลยืนยันการส่งมอบ
  completedAt: string | null;
  handover: {
    owner: HandoverReport | null;
    applicant: HandoverReport | null;
    ownerConfirmed: boolean;
    applicantConfirmed: boolean;
  };
  pet: Pet;
}
