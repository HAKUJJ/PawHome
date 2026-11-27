// =========================================================
// Store ของหน้า Admin (Zustand) — แยกจาก useAuthStore
// เริ่มว่างเสมอ ข้อมูลมาจาก Backend (/api/admin/*) ผ่าน real.ts เท่านั้น — ไม่มีข้อมูลจำลองหรือ fallback
// =========================================================
import { create } from "zustand";
import type { Sex, Species } from "../types/pet";
import type { AdminMe } from "./api";
import { HOUR, isTerminal, type AdoptionCase } from "./workflow";

export interface PreviewUser { id: string; name: string; role: "member" | "admin"; joinedAt: number; province: string }
// review = รอตรวจ · changes = ส่งกลับให้เจ้าของแก้ไข (เหตุผลใน reviewNote)
export type Visibility = "visible" | "hidden" | "review" | "changes";
export interface PreviewPet {
  id: number; name: string; species: Species; breed: string; sex: Sex; ageMonths: number; province: string; ownerId: string;
  imageUrl: string; visibility: Visibility; createdAt: number; description: string; vaccinated: boolean; sterilized: boolean;
  reviewNote?: string;
}
export interface Announcement {
  id: string; title: string; category: string; description: string; date: string; time: string; location: string;
  contact: string; cta: string; destination: string; published: boolean; order: number;
}
// ชื่อที่แสดงบนหัวหน้าผู้ดูแล (มาจากบัญชีผ่าน /api/admin/me)
export interface Preferences { name: string }
export interface PreviewData {
  users: PreviewUser[]; pets: PreviewPet[]; cases: AdoptionCase[]; announcements: Announcement[];
  preferences: Preferences;
}

// สถานะการยืนยันสิทธิ์กับ Backend
export type AdminStatus = "checking" | "ready" | "unauthorized" | "forbidden" | "error";

const defaultPreferences = (): Preferences => ({ name: "ผู้ดูแล PawHome" });
const emptyData = (): PreviewData => ({ users: [], pets: [], cases: [], announcements: [], preferences: defaultPreferences() });

type State = PreviewData & { status: AdminStatus; error?: string; me?: AdminMe };

export const usePreview = create<State>(() => ({ ...emptyData(), status: "checking" }));

export function userName(data: Pick<PreviewData, "users">, id: string) { return data.users.find((user) => user.id === id)?.name ?? "–"; }
export function petOf(data: Pick<PreviewData, "pets">, id: number) { return data.pets.find((pet) => pet.id === id); }
export function ownerOf(data: Pick<PreviewData, "pets">, item: AdoptionCase) { return petOf(data, item.petId)?.ownerId ?? ""; }

export const visibilityLabel: Record<Exclude<Visibility, "visible">, string> = { review: "รอตรวจสอบ", hidden: "ซ่อนอยู่", changes: "ส่งกลับให้แก้ไข" };

export function petStatus(data: Pick<PreviewData, "cases">, pet: PreviewPet) {
  if (pet.visibility !== "visible") return visibilityLabel[pet.visibility];
  if (data.cases.some((item) => item.petId === pet.id && item.stage === "COMPLETED")) return "ได้บ้านแล้ว";
  return data.cases.some((item) => item.petId === pet.id && !isTerminal(item.stage)) ? "มีคำขอรับเลี้ยง" : "รอบ้าน";
}

const thaiDate = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const thaiDateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
export const formatDate = (timestamp: number) => thaiDate.format(timestamp);
export const formatDateTime = (timestamp: number) => thaiDateTime.format(timestamp);
export function ago(timestamp: number, now: number) {
  const hours = Math.max(0, Math.floor((now - timestamp) / HOUR));
  return hours < 1 ? "เมื่อสักครู่" : hours < 24 ? `${hours} ชม.ที่แล้ว` : `${Math.floor(hours / 24)} วันที่แล้ว`;
}
export const idleText = (hours: number) => (hours < 48 ? `${hours} ชม.` : `${Math.floor(hours / 24)} วัน`);
