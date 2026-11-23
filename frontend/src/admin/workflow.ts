// =========================================================
// กฎขั้นตอนรับเลี้ยงของ Admin Preview (ข้อเสนอ UI — ไม่ใช่ enum ในฐานข้อมูล และไม่เกี่ยวกับ Production API)
// ฟังก์ชันล้วน: รับเคส + การกระทำ → คืนเคสใหม่ (หรือเคสเดิมถ้าทำไม่ได้) · ไม่มีการเปลี่ยนสถานะอัตโนมัติตามเวลา
// =========================================================

export const stageLabel = {
  PENDING: "รอเจ้าของตอบกลับ",
  ACCEPTED: "เจ้าของตอบรับแล้ว",
  ARRANGING_HANDOVER: "กำลังนัดส่งมอบ",
  HANDOVER_REPORTED: "แจ้งส่งมอบแล้ว รอยืนยัน",
  COMPLETED: "รับเลี้ยงสำเร็จ",
  REJECTED: "ปฏิเสธคำขอ",
  CANCELLED: "ยกเลิกคำขอ",
};
export type Stage = keyof typeof stageLabel;

export type Party = "owner" | "applicant";
export const partyLabel = { owner: "เจ้าของ", applicant: "ผู้ขอรับเลี้ยง", admin: "ผู้ดูแล" };
export type Actor = keyof typeof partyLabel;

export interface Handover {
  date: string; // YYYY-MM-DD
  status: "delivered" | "failed";
  note: string;
  evidence: boolean; // แนบหลักฐานตัวอย่าง (ไม่มีไฟล์จริง)
}
export const handoverLabel = { delivered: "ส่งมอบแล้ว", failed: "ยังไม่ได้ส่งมอบ" };

export interface CaseEvent { actor: Actor; label: string; at: number; note?: string }

export interface AdoptionCase {
  id: string;
  petId: number;
  applicantId: string;
  stage: Stage;
  createdAt: number;
  activityAt: number; // เวลาที่มีการดำเนินการสำคัญล่าสุด (เปลี่ยนขั้น) — ใช้คำนวณความเร่งด่วน
  contact: string;
  message: string;
  housing: string;
  flagged: boolean; // FOLLOW_UP_REQUIRED ที่ผู้ดูแลตั้งเอง (แยกจาก stage)
  disputed: boolean;
  escalated: boolean;
  closed: boolean;
  verified: boolean;
  resolution?: string;
  completedAt?: number;
  reports: Partial<Record<Party, Handover>>;
  confirmations: Partial<Record<Party, boolean>>;
  timeline: CaseEvent[];
}

export type CaseAction =
  | { type: "accept" | "reject" | "arrange" | "cancel" }
  | { type: "report"; party: Party; report: Handover }
  | { type: "confirm" | "dispute"; party: Party }
  | { type: "flag" | "unflag" | "escalate" | "markDisputed" | "close" }
  | { type: "contact" | "note" | "verify"; note: string };

export const priorityLabel = { normal: "ปกติ", reminder: "แจ้งเตือนแล้ว", high: "ต้องติดตาม", urgent: "ด่วน" };
export type Priority = keyof typeof priorityLabel;
export const priorityRank: Record<Priority, number> = { normal: 0, reminder: 1, high: 2, urgent: 3 };

export const isTerminal = (stage: Stage) => stage === "COMPLETED" || stage === "REJECTED" || stage === "CANCELLED";
export const HOUR = 3_600_000;

// นโยบายติดตาม (ค่าตัวอย่าง): เจ้าของเงียบขณะ PENDING 24 ชม. = เตือน · 48 = ผู้ดูแลติดตาม · 72 = ไม่ตอบกลับ ส่งต่อเร่งด่วน
export function followUp(item: AdoptionCase, now: number) {
  const hours = Math.max(0, Math.floor((now - item.activityAt) / HOUR));
  const idle = item.stage === "PENDING" ? hours : 0;
  const overdue = !isTerminal(item.stage) && idle >= 48;
  let priority: Priority = "normal";
  if (!isTerminal(item.stage) && !item.closed) {
    if (item.disputed || item.escalated || idle >= 72) priority = "urgent";
    else if (item.flagged || overdue) priority = "high";
    else if (idle >= 24) priority = "reminder";
  }
  return { hours, idle, overdue, priority, required: priorityRank[priority] >= priorityRank.high };
}

// รายงานส่งมอบสองฝ่ายตรงกัน = ทั้งคู่ "ส่งมอบแล้ว" และวันที่เดียวกัน
export function reportsMatch(item: AdoptionCase) {
  const { owner, applicant } = item.reports;
  return owner?.status === "delivered" && applicant?.status === "delivered" && owner.date === applicant.date;
}

export function transition(item: AdoptionCase, action: CaseAction, now: number): AdoptionCase {
  if (item.closed) return item;
  // record = บันทึกในไทม์ไลน์อย่างเดียว (ไม่รีเซ็ตเวลาเงียบ) · advance = เปลี่ยนขั้น (นับเป็นการดำเนินการสำคัญ)
  const record = (actor: Actor, label: string, changes: Partial<AdoptionCase>, note?: string): AdoptionCase =>
    ({ ...item, ...changes, timeline: [...item.timeline, { actor, label, at: now, note }] });
  const advance = (actor: Actor, stage: Stage, label: string, changes: Partial<AdoptionCase> = {}) =>
    record(actor, label, { ...changes, stage, activityAt: now });
  const note = "note" in action ? action.note.trim() : "";

  if (action.type === "close" && isTerminal(item.stage)) return record("admin", "ปิดเคส", { closed: true });
  if (action.type === "verify" && item.stage === "COMPLETED" && !item.verified && note) {
    return record("admin", "ตรวจสอบการส่งมอบแล้ว", { verified: true, resolution: note }, note);
  }
  if (isTerminal(item.stage)) return item;

  switch (action.type) {
    case "accept":
      return item.stage === "PENDING" ? advance("owner", "ACCEPTED", "ตอบรับคำขอ") : item;
    case "reject":
      return item.stage === "PENDING" ? advance("owner", "REJECTED", "ปฏิเสธคำขอ") : item;
    case "arrange":
      return item.stage === "ACCEPTED" ? advance("owner", "ARRANGING_HANDOVER", "เริ่มนัดส่งมอบ") : item;
    case "cancel":
      return ["PENDING", "ACCEPTED", "ARRANGING_HANDOVER"].includes(item.stage) ? advance("applicant", "CANCELLED", "ยกเลิกคำขอ") : item;
    case "report": {
      if ((item.stage !== "ARRANGING_HANDOVER" && item.stage !== "HANDOVER_REPORTED") || !action.report.date) return item;
      const reports = { ...item.reports, [action.party]: action.report };
      const mismatch = Boolean(reports.owner && reports.applicant &&
        (reports.owner.date !== reports.applicant.date || reports.owner.status !== reports.applicant.status));
      // รายงานใหม่ล้างการยืนยันเดิม — ทั้งสองฝ่ายต้องยืนยันข้อมูลชุดล่าสุด
      const next = advance(action.party, "HANDOVER_REPORTED", "บันทึกรายงานส่งมอบ", { reports, confirmations: {}, disputed: item.disputed || mismatch });
      if (mismatch && !item.disputed) next.timeline.push({ actor: "admin", label: "ข้อมูลส่งมอบไม่ตรงกัน · ต้องตรวจสอบ", at: now });
      return next;
    }
    case "confirm": {
      if (item.stage !== "HANDOVER_REPORTED" || !reportsMatch(item) || item.confirmations[action.party]) return item;
      const confirmations = { ...item.confirmations, [action.party]: true };
      const completed = Boolean(confirmations.owner && confirmations.applicant && !item.disputed);
      return advance(action.party, completed ? "COMPLETED" : item.stage, completed ? "ยืนยันส่งมอบครบ · รับเลี้ยงสำเร็จ" : "ยืนยันรายละเอียดส่งมอบ",
        { confirmations, ...(completed ? { completedAt: now } : {}) });
    }
    case "dispute":
    case "markDisputed":
      return item.stage === "HANDOVER_REPORTED" && !item.disputed
        ? record(action.type === "dispute" ? action.party : "admin", "แจ้งข้อพิพาท · ต้องตรวจสอบ", { disputed: true }) : item;
    case "verify":
      // เคสพิพาทปิดได้เมื่อรายงานตรงกัน ทั้งสองฝ่ายยืนยัน และผู้ดูแลบันทึกผลตรวจ
      return item.disputed && reportsMatch(item) && item.confirmations.owner && item.confirmations.applicant && note
        ? record("admin", "ยืนยันผลตรวจสอบ · รับเลี้ยงสำเร็จ", {
          verified: true, resolution: note, disputed: false, stage: "COMPLETED", activityAt: now, completedAt: now,
        }, note) : item;
    case "flag":
      return item.flagged ? item : record("admin", "ตั้งธงต้องติดตาม", { flagged: true });
    case "unflag":
      return item.flagged ? record("admin", "นำธงต้องติดตามออก", { flagged: false }) : item;
    case "escalate":
      return item.escalated ? item : record("admin", "ส่งต่อเคสเร่งด่วน", { escalated: true });
    case "contact":
    case "note":
      return note ? record("admin", action.type === "contact" ? "บันทึกการติดต่อ" : "เพิ่มบันทึกติดตาม", {}, note) : item;
    default:
      return item;
  }
}

// 5 ส่วนของเคส: คำขอ → เจ้าของตอบรับ → ส่งมอบจริง → ผู้ดูแลตรวจสอบ → ปิดเคส
export const caseSteps = ["คำขอรับเลี้ยง", "เจ้าของตอบรับ", "การส่งมอบจริง", "ผู้ดูแลตรวจสอบ", "ปิดเคส"];
export function currentStep(item: Pick<AdoptionCase, "closed" | "stage" | "verified" | "disputed">) {
  if (item.closed) return 4;
  if (item.verified || item.disputed || item.stage === "COMPLETED") return 3;
  if (item.stage === "HANDOVER_REPORTED" || item.stage === "ARRANGING_HANDOVER") return 2;
  if (item.stage === "ACCEPTED" || item.stage === "REJECTED") return 1;
  return 0;
}

export function createCase(id: string, petId: number, applicantId: string, now: number, detail?: Partial<Pick<AdoptionCase, "contact" | "message" | "housing">>): AdoptionCase {
  return {
    id, petId, applicantId, stage: "PENDING", createdAt: now, activityAt: now,
    contact: "08x-xxx-xxxx (ข้อมูลจำลอง)", message: "มีพื้นที่ในบ้านและพร้อมดูแลระยะยาว", housing: "บ้านเดี่ยว", ...detail,
    flagged: false, disputed: false, escalated: false, closed: false, verified: false, reports: {}, confirmations: {},
    timeline: [{ actor: "applicant", label: "ส่งคำขอรับเลี้ยง", at: now }],
  };
}
