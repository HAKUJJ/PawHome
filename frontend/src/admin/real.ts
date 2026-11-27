// Real Admin Mode: โหลด / เปลี่ยนข้อมูลผ่าน Backend แล้วเขียนลง store เดิม
// ยืนยันสิทธิ์ด้วย GET /admin/me ก่อนโหลดข้อมูลอื่นทุกครั้ง · ไม่เคยใช้ role ที่เก็บในเบราว์เซอร์
import { ApiError } from "../api/client";
import { adminApi, caseKey, caseNumber, toAnnouncement, toAudit, toCase, toEvent, toPet, toUser } from "./api";
import { usePreview, type AdminStatus } from "./store";
import { toast } from "../stores/useToastStore";
import { notify } from "./ui";

const fail = (message: string) => toast(message, "error");
import type { CaseAction } from "./workflow";

const empty = { users: [], pets: [], cases: [], announcements: [], logs: [], me: undefined };

function statusOf(error: unknown): { status: AdminStatus; error: string } {
  if (error instanceof ApiError && error.status === 401) return { status: "unauthorized", error: error.message };
  if (error instanceof ApiError && error.status === 403) return { status: "forbidden", error: error.message };
  return { status: "error", error: error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ" };
}

// silent = รีเฟรชหลังเปลี่ยนข้อมูล (ไม่ปิดหน้าจอระหว่างโหลด)
export async function loadAdmin({ silent = false } = {}) {
  if (!silent) usePreview.setState({ ...empty, status: "checking", error: undefined });
  try {
    const me = await adminApi.me();
    const [pets, cases, users, announcements, audit] = await Promise.all([
      adminApi.pets(), adminApi.cases(), adminApi.users(), adminApi.announcements(), adminApi.auditLogs(),
    ]);
    const state = usePreview.getState();
    // เก็บไทม์ไลน์ที่โหลดไว้แล้ว (โหลดทีละเคสตอนเปิดหน้ารายละเอียด)
    const timelines = new Map(state.cases.map((item) => [item.id, item.timeline]));
    const names = {
      pets: new Map(pets.map((p) => [String(p.id), p.name])),
      users: new Map(users.map((u) => [u.id, u.name])),
      announcements: new Map(announcements.map((a) => [String(a.id), a.title])),
    };
    usePreview.setState({
      me, status: "ready", error: undefined,
      pets: pets.map(toPet),
      cases: cases.map((c) => toCase(c, timelines.get(caseKey(c.id)) ?? [])),
      users: users.map(toUser),
      announcements: announcements.map(toAnnouncement),
      logs: audit.items.map((entry) => toAudit(entry, names)),
      preferences: { ...state.preferences, name: me.name },
    });
  } catch (error) {
    const next = statusOf(error);
    // หมดสิทธิ์ระหว่างใช้งาน → ล้างข้อมูลทันที · error อื่นตอนรีเฟรชเงียบ ๆ เก็บข้อมูลเดิมไว้แล้วแจ้งเตือน
    if (!silent || next.status !== "error") usePreview.setState({ ...empty, ...next });
    else fail(`รีเฟรชข้อมูลไม่สำเร็จ: ${next.error}`);
  }
}

export function clearAdmin(status: AdminStatus = "unauthorized") {
  usePreview.setState({ ...empty, status, error: undefined });
}

export async function loadTimeline(key: string) {
  try {
    const events = (await adminApi.timeline(caseNumber(key))).map(toEvent);
    usePreview.setState((state) => ({ cases: state.cases.map((item) => (item.id === key ? { ...item, timeline: events } : item)) }));
  } catch (error) {
    fail(`โหลดไทม์ไลน์ไม่สำเร็จ: ${error instanceof Error ? error.message : ""}`);
  }
}

// เรียก API → แจ้งผล → โหลดข้อมูลใหม่จาก Backend (ไม่แก้ store เองล่วงหน้า: ไม่มี optimistic update ในงานผู้ดูแล)
export async function mutateAdmin(run: () => Promise<unknown>, success: string): Promise<boolean> {
  try {
    await run();
    notify(success);
    await loadAdmin({ silent: true });
    return true;
  } catch (error) {
    fail(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) await loadAdmin({ silent: true });
    return false;
  }
}

// การกระทำของผู้ดูแลบนเคส → endpoint จริง (ผู้ดูแลไม่มีปุ่มตอบรับ/ส่งมอบแทนเจ้าของหรือผู้ขอ)
export async function realCaseAction(key: string, action: CaseAction, success: string) {
  const id = caseNumber(key);
  const item = usePreview.getState().cases.find((entry) => entry.id === key);
  const run = (): Promise<unknown> => {
    switch (action.type) {
      case "flag": return adminApi.followUp(id, "FLAG");
      case "unflag": return adminApi.followUp(id, "UNFLAG");
      case "contact": return adminApi.followUp(id, "CONTACT", action.note);
      case "note": return adminApi.followUp(id, "NOTE", action.note);
      case "escalate": return adminApi.escalate(id);
      case "markDisputed": return adminApi.reviewHandover(id, "MARK_DISPUTED", "ผู้ดูแลทำเครื่องหมายข้อพิพาทจากหน้ารายละเอียดเคส");
      case "verify": return adminApi.reviewHandover(id, item?.stage === "COMPLETED" ? "VERIFY" : "COMPLETE", action.note);
      case "legacyComplete": return adminApi.reviewHandover(id, "COMPLETE", action.note);
      case "legacyReopen": return adminApi.reviewHandover(id, "REOPEN", action.note);
      case "close": return adminApi.closeCase(id);
      default: return Promise.reject(new Error("การกระทำนี้ทำได้เฉพาะเจ้าของโพสต์หรือผู้ขอรับเลี้ยง"));
    }
  };
  const ok = await mutateAdmin(run, success);
  if (ok) await loadTimeline(key);
  return ok;
}
