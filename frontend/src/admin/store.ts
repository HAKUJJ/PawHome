// =========================================================
// Mock store ของ Admin Preview (Zustand) — แยกจาก useAuthStore และไม่เรียก API ใด ๆ
// ข้อมูลทั้งหมดอยู่ในหน่วยความจำ รีเฟรชหน้า = กลับเป็นข้อมูลตั้งต้น · ทุกการกระทำเพิ่มรายการใน logs
// =========================================================
import { create } from "zustand";
import { homePromos } from "../data/promos";
import type { Sex, Species } from "../types/pet";
import { createCase, HOUR, isTerminal, transition, type Actor, type AdoptionCase, type CaseAction, type Handover } from "./workflow";

export interface PreviewUser { id: string; name: string; role: "member" | "admin"; suspended: boolean; joinedAt: number; province: string }
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
export interface Audit { id: string; actor: string; action: string; target: string; at: number; category: "เคส" | "สัตว์เลี้ยง" | "ผู้ใช้" | "ประกาศ" | "ระบบ"; note?: string }
export interface Preferences {
  name: string; reminders: boolean; escalation: boolean; density: "regular" | "compact"; trends: boolean;
  showQuickActions: boolean; timeShift: number; // เลื่อนเวลาจำลอง (ชั่วโมง) เพื่อดูเกณฑ์ 24/48/72
}
export interface PreviewData {
  users: PreviewUser[]; pets: PreviewPet[]; cases: AdoptionCase[]; announcements: Announcement[];
  logs: Audit[]; preferences: Preferences;
}

export const demoPetId = 1; // น้องที่ใช้ในหน้าจำลองขั้นตอน
export const demoApplicantId = "U4";
const DAY = 24 * HOUR;
const dog = (path: string) => `https://images.dog.ceo/breeds/${path}.jpg`;
const cat = (id: string) => `https://cdn2.thecatapi.com/images/${id}.jpg`;

function seed(now = Date.now()): PreviewData {
  const users: PreviewUser[] = ([
    ["U1", "มะลิ", "กรุงเทพมหานคร", 210], ["U2", "ต้นกล้า", "นนทบุรี", 190], ["U3", "ฟ้าใส", "ปทุมธานี", 160], ["U4", "พิม", "กรุงเทพมหานคร", 120],
    ["U5", "ภูมิ", "เชียงใหม่", 95], ["U7", "ป่อง", "กรุงเทพมหานคร", 300], ["U8", "บ้านพักน้องจร", "นนทบุรี", 400], ["U9", "แพรวา", "สมุทรปราการ", 80],
    ["U10", "นุ่น", "ชลบุรี", 75], ["U11", "เจ", "นนทบุรี", 66], ["U12", "มายด์", "กรุงเทพมหานคร", 58], ["U13", "อาร์ม", "นครปฐม", 44],
    ["U14", "ฝน", "เชียงใหม่", 40], ["U15", "ก้อง", "ขอนแก่น", 33], ["U16", "ปลาทู", "เชียงราย", 28], ["U17", "ใบเตย", "ภูเก็ต", 21], ["U18", "ต่อ", "ระยอง", 9],
  ] as const).map(([id, name, province, days]) => ({ id, name, province, role: "member", suspended: id === "U5", joinedAt: now - days * DAY }));
  users.push({ id: "U6", name: "ผู้ดูแล PawHome", province: "กรุงเทพมหานคร", role: "admin", suspended: false, joinedAt: now - 420 * DAY });

  type Row = [string, Species, string, Sex, number, string, string, string, Visibility, number, string, boolean, boolean];
  const rows: Row[] = [
    ["โมจิ", "CAT", "ไทย", "FEMALE", 8, "กรุงเทพมหานคร", "U1", "/pawhome-cat.png", "visible", 4, "แมวขี้อ้อน ชอบนั่งใกล้คนและเล่นกับของเล่น", true, false],
    ["ข้าวปั้น", "DOG", "พันทาง", "MALE", 16, "นนทบุรี", "U2", dog("mix/rilo"), "visible", 5, "สุนัขร่าเริง ชอบเดินเล่นและเล่นกับคน", true, true],
    ["ลูกตาล", "CAT", "ไทย", "FEMALE", 11, "ปทุมธานี", "U3", cat("267"), "review", 3, "คุ้นเคยกับการอยู่ในบ้าน ใช้กระบะทรายเป็น", true, false],
    ["งาดำ", "DOG", "พันทาง", "MALE", 24, "เชียงใหม่", "U2", dog("mix/xeshabelka_(33)"), "visible", 6, "ชอบพื้นที่สงบ เหมาะกับบ้านที่ไม่มีเด็กเล็ก", false, true],
    // ชื่อยาวผิดปกติ + ไม่มีรูป + ไม่มีคำอธิบาย ไว้ทดสอบ layout
    ["น้องขนฟู".repeat(8) + "1234567890".repeat(3), "OTHER", "", "FEMALE", 6, "เชียงใหม่", "U3", "", "hidden", 1, "", false, false],
    ["ทองหยิบ", "CAT", "ไทย", "MALE", 14, "กรุงเทพมหานคร", "U1", cat("O-57OLhn7"), "visible", 10, "ชอบนอนตากแดด เป็นมิตรกับแมวตัวอื่น", true, true],
    ["ส้มจี๊ด", "CAT", "ไทย", "MALE", 10, "กรุงเทพมหานคร", "U7", cat("3rK7HGo7r"), "visible", 30, "แมวส้มขี้เล่น ชอบวิ่งไล่ของเล่น", true, false],
    ["บราวนี่", "DOG", "พันทาง", "FEMALE", 72, "ชลบุรี", "U8", dog("mix/cheyenne2"), "visible", 20, "หมาสูงวัยใจดี ชอบนอนกลางแดด", true, true],
    ["ดำดี", "DOG", "พันทาง", "MALE", 30, "นนทบุรี", "U8", dog("mix/floki-the-chilean-mutt-6"), "visible", 25, "ตัวดำขลับ ฉลาด รู้คำสั่งพื้นฐาน", true, true],
    ["ถั่วแดง", "DOG", "ชิบะผสม", "MALE", 14, "ปทุมธานี", "U8", dog("shiba/shiba-13"), "visible", 12, "ร่าเริง เข้ากับเด็กได้ดี", true, false],
    ["ช็อกโก้", "CAT", "ไทย", "FEMALE", 20, "สมุทรปราการ", "U8", cat("edr"), "visible", 14, "แมวขนน้ำตาล เงียบ ชอบซุกตัว", true, true],
    ["ขนมปัง", "CAT", "ไทย", "FEMALE", 9, "นครปฐม", "U8", cat("HDxfaNlLj"), "visible", 6, "ลูกแมวขี้อ้อน กินเก่ง", false, false],
    ["มะปราง", "CAT", "วิเชียรมาศ", "FEMALE", 18, "กรุงเทพมหานคร", "U7", cat("MTY3NjI5MQ"), "visible", 5, "ช่างคุย ชอบนั่งบนตัก", true, true],
    ["นมเย็น", "DOG", "พันทาง", "FEMALE", 26, "เชียงใหม่", "U8", dog("mix/xeshabelka_(21)"), "visible", 9, "ขนนุ่ม สุภาพ ไม่เห่าเสียงดัง", true, true],
    ["ลาเต้", "DOG", "ลาบราดอร์", "MALE", 40, "ขอนแก่น", "U15", dog("labrador/n02099712_3503"), "visible", 8, "ใจดี ชอบว่ายน้ำ", true, true],
    ["ข้าวเหนียว", "CAT", "ขาวมณี", "MALE", 30, "เชียงราย", "U16", cat("bpc"), "visible", 40, "แมวขาวตาฟ้า อยู่คอนโดได้", true, true],
    ["บัวลอย", "DOG", "ปอมเมอเรเนียน", "FEMALE", 22, "ภูเก็ต", "U17", dog("pomeranian/n02112018_1090"), "visible", 45, "ตัวเล็ก ติดคน", true, true],
    ["ปุยฝ้าย", "CAT", "เปอร์เซีย", "FEMALE", 12, "นนทบุรี", "U16", cat("a3h"), "visible", 52, "ขนยาว ชอบให้แปรงขน", true, false],
    ["ทองดี", "DOG", "โกลเด้น", "MALE", 36, "อุบลราชธานี", "U17", dog("retriever-golden/n02099601_3004"), "visible", 58, "สุภาพ ฝึกขับถ่ายแล้ว", true, true],
    ["โอวัลติน", "CAT", "ไทย", "MALE", 16, "สงขลา", "U15", cat("9pk"), "visible", 47, "ขี้เล่นแต่ไม่ข่วน", true, true],
    ["ภูผา", "DOG", "ไซบีเรียนผสม", "MALE", 28, "นนทบุรี", "U11", dog("husky/n02110185_1469"), "review", 1, "ต้องการพื้นที่วิ่ง", true, false],
    ["เมฆ", "CAT", "ไทย", "MALE", 7, "ระยอง", "U12", cat("ai6"), "review", 2, "ลูกแมวสีเทา เพิ่งฉีดวัคซีนเข็มแรก", true, false],
    ["ส้มโอ", "DOG", "คอร์กี้ผสม", "FEMALE", 13, "พิษณุโลก", "U13", dog("corgi/13263927_10154125975153449_6587119903523649180_n"), "review", 3, "ขาสั้นวิ่งไว", false, false],
  ];
  const pets: PreviewPet[] = rows.map(([name, species, breed, sex, ageMonths, province, ownerId, imageUrl, visibility, days, description, vaccinated, sterilized], index) => ({
    id: index + 1, name, species, breed, sex, ageMonths, province, ownerId, imageUrl, visibility, createdAt: now - days * DAY, description, vaccinated, sterilized,
  }));

  // เคส: สร้างผ่าน transition() ทุกขั้น ข้อมูลจึงตรงกับกฎ · ตัวเลข = ชั่วโมงก่อนตอนนี้
  const handed = (hoursAgo: number, status: Handover["status"] = "delivered"): Handover =>
    ({ date: new Date(now - hoursAgo * HOUR).toISOString().slice(0, 10), status, note: status === "delivered" ? "นัดรับที่บ้านผู้ขอ" : "ยังไม่ได้รับน้อง", evidence: true });
  const build = (id: string, petId: number, applicantId: string, start: number, steps: [CaseAction, number][] = [], housing = "บ้านเดี่ยว") =>
    steps.reduce((item, [action, at]) => transition(item, action, now - at * HOUR),
      createCase(id, petId, applicantId, now - start * HOUR, { housing, message: `สนใจรับน้อง${pets[petId - 1].name} มีเวลาดูแลและเคยเลี้ยงสัตว์มาก่อน` }));
  const reported = (start: number, at: number, applicant: Handover["status"] = "delivered"): [CaseAction, number][] => [
    [{ type: "accept" }, start - 20], [{ type: "arrange" }, start - 30],
    [{ type: "report", party: "owner", report: handed(at) }, at], [{ type: "report", party: "applicant", report: handed(at, applicant) }, at - 1],
  ];
  const done = (id: string, petId: number, applicantId: string, start: number) => build(id, petId, applicantId, start, [
    ...reported(start, start - 60), [{ type: "confirm", party: "owner" }, start - 64], [{ type: "confirm", party: "applicant" }, start - 66],
  ], "คอนโด");

  const cases = [
    build("AD-104", 2, "U3", 78), build("AD-105", 3, "U4", 51, [], "ทาวน์เฮาส์"), build("AD-106", 1, "U5", 26), build("AD-107", 5, "U2", 8),
    build("AD-103", 4, "U1", 100, reported(100, 52, "failed")),
    done("AD-102", 6, "U2", 160),
    build("AD-108", 7, "U9", 75, [], "ทาวน์เฮาส์"),
    build("AD-109", 8, "U10", 120, reported(120, 42, "failed")),
    build("AD-110", 9, "U9", 300, [[{ type: "accept" }, 260], [{ type: "arrange" }, 216], [{ type: "flag" }, 40]]),
    build("AD-111", 10, "U11", 150, [[{ type: "accept" }, 96], [{ type: "flag" }, 20]], "คอนโด"),
    build("AD-112", 11, "U12", 200, [...reported(200, 50), [{ type: "confirm", party: "applicant" }, 48], [{ type: "flag" }, 10]]),
    build("AD-113", 12, "U13", 50),
    build("AD-114", 13, "U12", 30, [], "คอนโด"),
    build("AD-115", 14, "U14", 90, [...reported(90, 12), [{ type: "confirm", party: "owner" }, 10]]),
    build("AD-116", 15, "U18", 60, [[{ type: "accept" }, 45], [{ type: "arrange" }, 22], [{ type: "contact", note: "โทรถามวันนัด เจ้าของสะดวกเสาร์นี้" }, 6]]),
    build("AD-117", 13, "U14", 4), build("AD-118", 7, "U18", 2, [], "คอนโด"),
    build("AD-119", 2, "U13", 400, [[{ type: "reject" }, 380]]), build("AD-120", 4, "U11", 500, [[{ type: "cancel" }, 470]]),
    build("AD-121", 9, "U10", 330, [[{ type: "reject" }, 310]]),
    done("AD-122", 16, "U9", 960), done("AD-123", 17, "U10", 1100), done("AD-124", 18, "U12", 1250), done("AD-125", 19, "U14", 820), done("AD-126", 20, "U18", 700),
  ];

  const announcements: Announcement[] = homePromos.map((promo, index) => ({
    id: `A${index + 1}`, title: promo.title, category: promo.category, description: promo.description,
    date: promo.date?.start ?? "", time: promo.time, location: promo.location,
    contact: promo.contact.map((item) => `${item.label}: ${item.value}`).join(" · "),
    cta: promo.cta, destination: promo.path, published: index !== 2, order: index + 1,
  }));
  announcements.push({ id: "A4", title: "ตลาดนัดรับเลี้ยงน้องหมาแมว", category: "กิจกรรม", description: "พบน้องจากบ้านพักน้องจรตัวจริง พร้อมสัตวแพทย์ให้คำปรึกษา (ร่างตัวอย่าง)",
    date: "2026-12-12", time: "10:00–16:00", location: "ลานกิจกรรม PawHome (สมมติ)", contact: "ผู้จัด: ทีม PawHome (ข้อมูลจำลอง)", cta: "ดูรายละเอียด", destination: "/pets", published: false, order: 4 });

  const data: PreviewData = {
    users, pets, cases, announcements, logs: [],
    preferences: { name: "ผู้ดูแล PawHome", reminders: true, escalation: true, density: "regular", trends: true, showQuickActions: true, timeShift: 0 },
  };
  data.logs = [
    ...cases.flatMap((item) => item.timeline.map((event, index): Audit => ({
      id: `${item.id}-${index}`, actor: actorName(data, item, event.actor), action: event.label, target: item.id, at: event.at, category: "เคส", note: event.note,
    }))),
    ...pets.map((pet): Audit => ({ id: `P${pet.id}`, actor: userName(data, pet.ownerId), action: "สร้างโพสต์", target: pet.name, at: pet.createdAt, category: "สัตว์เลี้ยง" })),
    { id: "S1", actor: data.preferences.name, action: "ระงับบัญชี", target: "ภูมิ", at: now - 20 * DAY, category: "ผู้ใช้" as const, note: "รายงานพฤติกรรมไม่เหมาะสม (ตัวอย่าง)" },
  ].sort((a, b) => b.at - a.at);
  return data;
}

type State = PreviewData & {
  // เปลี่ยนข้อมูล + บันทึก log ในครั้งเดียว
  change: (action: string, target: string, category: Audit["category"], update: (state: PreviewData) => Partial<PreviewData>, note?: string) => void;
  act: (id: string, action: CaseAction) => boolean;
  submit: () => void;
  resetScenario: () => void;
  reset: () => void;
};

export const usePreview = create<State>((set, get) => ({
  ...seed(),
  change: (action, target, category, update, note) => set((state) => ({
    ...update(state),
    logs: [{ id: crypto.randomUUID(), actor: state.preferences.name, action, target, at: previewNow(state), category, note }, ...state.logs],
  })),
  act: (id, action) => {
    const state = get();
    const item = state.cases.find((entry) => entry.id === id);
    if (!item) return false;
    if (action.type === "accept" && hasOtherPlacement(state, item)) return false;
    const next = transition(item, action, previewNow(state));
    if (next === item) return false;
    // น้องหนึ่งตัวรับเลี้ยงสำเร็จได้ครั้งเดียว
    if (next.stage === "COMPLETED" && item.stage !== "COMPLETED" &&
      state.cases.some((entry) => entry.petId === item.petId && entry.id !== id && entry.stage === "COMPLETED")) return false;
    const events = next.timeline.slice(item.timeline.length).reverse().map((event): Audit => ({
      id: crypto.randomUUID(), actor: actorName(state, next, event.actor), action: event.label, target: id, at: event.at, category: "เคส", note: event.note,
    }));
    set({ cases: state.cases.map((entry) => (entry.id === id ? next : entry)), logs: [...events, ...state.logs] });
    return true;
  },
  submit: () => set((state) => {
    if (state.cases.some((item) => item.petId === demoPetId && (item.stage === "COMPLETED" || (item.applicantId === demoApplicantId && !isTerminal(item.stage))))) return state;
    const item = createCase(`AD-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, demoPetId, demoApplicantId, previewNow(state));
    return { cases: [...state.cases, item], logs: [{ id: crypto.randomUUID(), actor: userName(state, demoApplicantId), action: "ส่งคำขอรับเลี้ยง", target: item.id, at: item.createdAt, category: "เคส" }, ...state.logs] };
  }),
  resetScenario: () => set((state) => ({
    cases: state.cases.filter((item) => !(item.petId === demoPetId && item.applicantId === demoApplicantId)),
    logs: [{ id: crypto.randomUUID(), actor: state.preferences.name, action: "เริ่มสถานการณ์ใหม่", target: "ตัวจำลองขั้นตอน", at: previewNow(state), category: "ระบบ" }, ...state.logs],
  })),
  reset: () => set(seed()),
}));

// function (ไม่ใช่ const) เพราะ seed() เรียกใช้ตอนสร้าง store ระหว่างโหลดโมดูล — const จะยังไม่ถูกกำหนด (TDZ)
export function previewNow(state: Pick<PreviewData, "preferences">) { return Date.now() + state.preferences.timeShift * HOUR; }
export function userName(data: Pick<PreviewData, "users">, id: string) { return data.users.find((user) => user.id === id)?.name ?? "–"; }
export function petOf(data: Pick<PreviewData, "pets">, id: number) { return data.pets.find((pet) => pet.id === id); }
export function ownerOf(data: Pick<PreviewData, "pets">, item: AdoptionCase) { return petOf(data, item.petId)?.ownerId ?? ""; }
function actorName(data: Pick<PreviewData, "users" | "pets" | "preferences">, item: AdoptionCase, actor: Actor) {
  if (actor === "admin") return data.preferences.name;
  return userName(data, actor === "owner" ? ownerOf(data, item) : item.applicantId);
}

export const workflowCase = (data: PreviewData) => data.cases.filter((item) => item.petId === demoPetId && item.applicantId === demoApplicantId).at(-1);

// น้องตัวนี้มีคำขออื่นที่เจ้าของตอบรับไปแล้ว → ตอบรับซ้ำไม่ได้
export function hasOtherPlacement(data: Pick<PreviewData, "cases">, item: AdoptionCase) {
  return data.cases.some((entry) => entry.petId === item.petId && entry.id !== item.id && !["PENDING", "REJECTED", "CANCELLED"].includes(entry.stage));
}

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
