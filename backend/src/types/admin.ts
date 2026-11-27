// รูปแบบข้อมูลของ /api/admin/* — ต้องตรงกับ frontend/src/admin/api.ts
import type { AdoptionStage, AdoptionStatus, Housing, PetStatus, PetVisibility, Sex, Species } from "./dto.js";

export type AdminRoleName = "USER" | "ADMIN" | "SUPER_ADMIN";
export type Priority = "normal" | "reminder" | "high" | "urgent";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminMe {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SUPER_ADMIN";
  permissions: readonly string[];
  workflow: { handoverEnabled: boolean; reminderHours: number; adminHours: number; escalationHours: number };
}

export interface AdminPet {
  id: number;
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  ageMonths: number;
  province: string;
  description: string;
  imageUrl: string;
  vaccinated: boolean;
  sterilized: boolean;
  urgent: boolean;
  status: PetStatus;
  visibility: PetVisibility;
  moderationReason: string;
  moderatedAt: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  requestCount: number;
  openRequestCount: number;
}

export interface AdminHandoverReport {
  party: "OWNER" | "APPLICANT";
  handoverDate: string; // YYYY-MM-DD
  outcome: "HANDED_OVER" | "NOT_HANDED_OVER";
  note: string;
  evidenceUrl: string;
  version: number;
  createdAt: string;
}

export interface AdminCase {
  id: number;
  petId: number;
  petName: string;
  petImageUrl: string;
  ownerId: string;
  ownerName: string;
  applicantId: string;
  applicantName: string;
  phone: string; // เฉพาะผู้ดูแล — ห้ามส่งใน API สาธารณะ
  housing: Housing;
  message: string;
  stage: AdoptionStage;
  status: AdoptionStatus;
  createdAt: string;
  lastActivityAt: string;
  followUpRequired: boolean;
  disputed: boolean;
  legacyReview: boolean;
  closedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  resolution: string;
  handoverVersion: number;
  reports: { owner: AdminHandoverReport | null; applicant: AdminHandoverReport | null };
  confirmations: { owner: boolean; applicant: boolean };
  followUp: { hours: number; idle: number; overdue: boolean; priority: Priority; required: boolean };
}

export interface TimelineEvent {
  at: string;
  kind: "STAGE" | "FOLLOW_UP" | "REPORT";
  actorRole: string;
  actorName: string;
  label: string;
  note: string;
}

export interface AdminUser {
  id: string;
  name: string;
  role: AdminRoleName;
  joinedAt: string;
  petCount: number;
  openRequestCount: number;
}

export interface AdminAnnouncement {
  id: number;
  title: string;
  category: string;
  description: string;
  eventDate: string | null;
  eventTime: string;
  location: string;
  contact: string;
  cta: string;
  destination: string;
  imageUrl: string;
  status: "DRAFT" | "PUBLISHED";
  displayOrder: number;
  isDemo: boolean;
  publishedAt: string | null;
  publishAt: string | null;
  expireAt: string | null;
  updatedAt: string;
}

