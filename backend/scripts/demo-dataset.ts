// ชุดข้อมูลทดสอบ PawHome (ข้อมูลสมมติทั้งหมด) — ใช้ร่วมกันโดย
//   scripts/seed-demo-users.ts      สร้างบัญชีใน Supabase Auth (Development/Test เท่านั้น)
//   scripts/generate-demo-seed.ts   สร้างไฟล์ database/seeds/*.sql
//   tests/seed.test.ts              ทดสอบ seed บน PGlite
// อีเมลทุกบัญชีอยู่ใต้ @pawhome.test (โดเมนทดสอบ ส่งอีเมลไม่ได้จริง)
export const DATASET_ID = "pawhome-demo-v1";
export const DATASET_VERSION = "1.0.0";

export type Persona =
  | "super_admin" | "admin" | "shelter" | "rescue_group" | "fast_owner" | "silent_owner" | "owner"
  | "new_user" | "frequent_applicant" | "favorite_collector" | "canceller" | "adopter" | "rejected" | "applicant" | "suspended";

export interface DemoUser {
  key: string; // u01..u40
  email: string;
  name: string;
  persona: Persona;
  role?: "ADMIN" | "SUPER_ADMIN"; // ผู้ดูแลทดสอบ (Development เท่านั้น)
}

const rows: [Persona, string, string][] = [
  ["super_admin", "superadmin", "ผู้ดูแลสูงสุด (ทดสอบ)"],
  ["admin", "admin.nok", "นก ผู้ดูแล (ทดสอบ)"],
  ["admin", "admin.ton", "ต้น ผู้ดูแล (ทดสอบ)"],
  ["shelter", "shelter.sisa", "บ้านพักพิงสี่ขา (ทดสอบ)"],
  ["rescue_group", "rescue.paw", "กลุ่มช่วยน้องจรรอบเมือง (ทดสอบ)"],
  ["fast_owner", "owner.malee", "มาลี ใจดี"],
  ["silent_owner", "owner.somchai", "สมชาย เงียบขรึม"],
  ["owner", "owner.pim", "พิมพ์ชนก แสงทอง"],
  ["owner", "owner.krit", "กฤต วงศ์ประเสริฐ"],
  ["owner", "owner.nida", "นิดา บุญมา"],
  ["owner", "owner.arthit", "อาทิตย์ รุ่งเรือง"],
  ["owner", "owner.kanya", "กัญญา ศรีสุข"],
  ["owner", "owner.thana", "ธนา พึ่งบุญ"],
  ["owner", "owner.ploy", "พลอย จันทร์เพ็ญ"],
  ["owner", "owner.wut", "วุฒิ ทองดี"],
  ["owner", "owner.fah", "ฟ้า ใสสะอาด"],
  ["owner", "owner.beam", "บีม อินทร์แก้ว"],
  ["owner", "owner.mint", "มิ้นท์ ชัยมงคล"],
  ["owner", "owner.toey", "เตย ศักดิ์สิทธิ์"],
  ["owner", "owner.golf", "กอล์ฟ ประเสริฐศรี"],
  ["new_user", "new.joy", "จอย มาใหม่"],
  ["frequent_applicant", "applicant.ning", "หนิง ขอรับเลี้ยง"],
  ["favorite_collector", "fav.bow", "โบว์ รักหมาแมว"],
  ["canceller", "applicant.tee", "ตี๋ เปลี่ยนใจ"],
  ["adopter", "adopter.pop", "ป๊อป ได้น้องแล้ว"],
  ["rejected", "applicant.kwan", "ขวัญ ยังไม่ผ่าน"],
  ["applicant", "applicant.oat", "โอ๊ต สุขสบาย"],
  ["applicant", "applicant.aom", "ออม เก็บเงิน"],
  ["applicant", "applicant.big", "บิ๊ก ใจกว้าง"],
  ["applicant", "applicant.namwan", "น้ำหวาน หอมหวาน"],
  ["applicant", "applicant.tam", "ต้าม ร่าเริง"],
  ["applicant", "applicant.pang", "แป้ง นุ่มนวล"],
  ["applicant", "applicant.jack", "แจ็ค บ้านสวน"],
  ["applicant", "applicant.fern", "เฟิร์น ใบไม้"],
  ["applicant", "applicant.noon", "นุ่น ฟูฟ่อง"],
  ["applicant", "applicant.boss", "บอส คอนโดกลางเมือง"],
  ["applicant", "applicant.may", "เมย์ ดอกไม้"],
  ["applicant", "applicant.gun", "กันต์ ขยันงาน"],
  ["suspended", "suspended.x", "บัญชีถูกระงับ (ทดสอบ)"],
  ["applicant", "applicant.earn", "เอิร์น อบอุ่น"],
];

export const DEMO_DATASET_USERS: DemoUser[] = rows.map(([persona, slug, name], index) => {
  const key = `u${String(index + 1).padStart(2, "0")}`;
  return {
    key,
    email: `demo-${String(index + 1).padStart(2, "0")}.${slug}@pawhome.test`,
    name,
    persona,
    ...(persona === "super_admin" ? { role: "SUPER_ADMIN" as const } : persona === "admin" ? { role: "ADMIN" as const } : {}),
  };
});

// ช่วง id ที่ชุดข้อมูลนี้เป็นเจ้าของ (ใช้กันชนกับข้อมูลอื่นและใช้ลบเฉพาะชุดทดสอบ)
export const ID_RANGES = {
  pets: [2001, 2100],
  adoptionRequests: [3001, 3999],
  announcements: [501, 520],
  stageHistory: [910_001, 919_999],
  handoverReports: [920_001, 929_999],
  followUps: [930_001, 939_999],
  notifications: [940_001, 949_999],
  auditLogs: [950_001, 959_999],
} as const;

// ---------- ชุดข้อมูลขนาดเล็กสำหรับสาธิต (database/seeds/minimal/) ----------
// แยกอีเมล (mini-NN.*) และช่วง id จากชุดใหญ่ — ใช้ชุดใดชุดหนึ่งหรือทั้งสองชุดบนฐานข้อมูลเดียวกันได้โดยไม่ชนกัน
export const MINIMAL_DATASET_ID = "pawhome-demo-minimal-v1";
export const MINIMAL_DATASET_USERS: DemoUser[] = [
  { key: "m1", email: "mini-01.admin@pawhome.test", name: "ผู้ดูแลเดโม่", persona: "super_admin", role: "SUPER_ADMIN" },
  { key: "m2", email: "mini-02.shelter@pawhome.test", name: "บ้านพักน้องสายใจ (เดโม่)", persona: "shelter" },
  { key: "m3", email: "mini-03.owner@pawhome.test", name: "วรรณา ใจดี", persona: "owner" },
  { key: "m4", email: "mini-04.applicant@pawhome.test", name: "ภูมิ รักสัตว์", persona: "applicant" },
  { key: "m5", email: "mini-05.applicant@pawhome.test", name: "ปาล์ม สดใส", persona: "applicant" },
  { key: "m6", email: "mini-06.applicant@pawhome.test", name: "นิว มาใหม่", persona: "applicant" },
];
export const MINIMAL_ID_RANGES = {
  pets: [2201, 2210],
  adoptionRequests: [3501, 3512],
  announcements: [601, 603],
  stageHistory: [960_001, 960_999],
  handoverReports: [961_001, 961_999],
  followUps: [962_001, 962_999],
  notifications: [963_001, 963_999],
  auditLogs: [964_001, 964_999],
} as const;
