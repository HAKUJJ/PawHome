// =========================================================
// คำขอรับเลี้ยง (ต้องล็อกอิน) — ตาราง AdoptionRequest มี @@unique([userId, petId])
//   GET    /me/adoptions            คำขอที่ฉันยื่นไว้
//   POST   /pets/:id/adoptions      ยื่นคำขอ { phone, housing, message }
//   DELETE /adoptions/:id           ยกเลิกคำขอของตัวเอง (เฉพาะที่ยัง PENDING)
//   GET    /pets/:id/adoptions      คำขอทั้งหมดของน้องตัวนี้ (เฉพาะเจ้าของโพสต์)
//   PATCH  /adoptions/:id           อนุมัติ / ไม่ผ่าน { status: "APPROVED" | "REJECTED" } (เฉพาะเจ้าของโพสต์)
// =========================================================

import type { AdoptionInput, AdoptionRequest, AdoptionStatus, HandoverInput, TimelineEntry } from "../types/adoption";
import { request } from "./client";

export type ReviewStatus = Extract<AdoptionStatus, "APPROVED" | "REJECTED">;

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const arrangeHandover = (id: number) => post<AdoptionRequest>(`/adoptions/${id}/arrange`);
export const reportHandover = (id: number, input: HandoverInput) => post<AdoptionRequest>(`/adoptions/${id}/handover-reports`, input);
export const confirmHandover = (id: number) => post<AdoptionRequest>(`/adoptions/${id}/confirm`);
export const disputeHandover = (id: number, note: string) => post<AdoptionRequest>(`/adoptions/${id}/dispute`, { note });
export const getAdoptionTimeline = (id: number, signal?: AbortSignal) =>
  request<TimelineEntry[]>(`/adoptions/${id}/timeline`, { signal });

export function getMyAdoptions(): Promise<AdoptionRequest[]> {
  return request<AdoptionRequest[]>("/me/adoptions");
}

export function getPetAdoptions(petId: number, signal?: AbortSignal): Promise<AdoptionRequest[]> {
  return request<AdoptionRequest[]>(`/pets/${petId}/adoptions`, { signal });
}

export function createAdoption(petId: number, input: AdoptionInput): Promise<AdoptionRequest> {
  return request<AdoptionRequest>(`/pets/${petId}/adoptions`, { method: "POST", body: JSON.stringify(input) });
}

export function cancelAdoption(id: number): Promise<void> {
  return request<void>(`/adoptions/${id}`, { method: "DELETE" });
}

export function reviewAdoption(id: number, status: ReviewStatus): Promise<AdoptionRequest> {
  return request<AdoptionRequest>(`/adoptions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
