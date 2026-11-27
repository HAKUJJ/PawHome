// ระบบติดตามเคส: นโยบายเวลา + งานตามเวลา (cron) ที่สร้าง "เหตุการณ์แจ้งเตือน" เท่านั้น
// ไม่มีการอนุมัติ / ปฏิเสธ / ปิด / ลบ / เปลี่ยนน้องเป็น ADOPTED อัตโนมัติ · ยังไม่ส่งอีเมล/SMS (channel = IN_APP)
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import type { FollowUpPolicy } from "./adoption-workflow.js";

export const followUpPolicy: FollowUpPolicy = {
  reminderHours: env.FOLLOW_UP_REMINDER_HOURS,
  adminHours: env.FOLLOW_UP_ADMIN_HOURS,
  escalationHours: env.FOLLOW_UP_ESCALATION_HOURS,
};

type Kind = "OWNER_REMINDER" | "OWNER_SECOND_REMINDER" | "ADMIN_FOLLOW_UP" | "ESCALATION";

// เกณฑ์ไหนถึงแล้ว → เหตุการณ์อะไร ส่งถึงใคร (recipient null = คิวผู้ดูแล)
function dueEvents(idleHours: number, ownerId: string, policy: FollowUpPolicy): { kind: Kind; recipientId: string | null }[] {
  const events: { kind: Kind; recipientId: string | null }[] = [];
  if (idleHours >= policy.reminderHours) events.push({ kind: "OWNER_REMINDER", recipientId: ownerId });
  if (idleHours >= policy.adminHours) {
    events.push({ kind: "OWNER_SECOND_REMINDER", recipientId: ownerId });
    events.push({ kind: "ADMIN_FOLLOW_UP", recipientId: null });
  }
  if (idleHours >= policy.escalationHours) events.push({ kind: "ESCALATION", recipientId: null });
  return events;
}

export const followUpService = {
  // idempotent: unique (request_id, kind, activity_at) + skipDuplicates → รันซ้ำกี่รอบก็ไม่สร้างซ้ำ
  // รอบใหม่เริ่มเมื่อ last_activity_at เปลี่ยน (เปลี่ยนขั้น) — ผู้ดูแลบันทึกการติดต่อไม่ทำให้เริ่มรอบใหม่
  // shortcut: โหลดคำขอ PENDING ทั้งหมดในครั้งเดียว, ถ้าเกินหลักหมื่นให้แบ่งหน้าด้วย cursor
  async sweep(now = new Date(), policy = followUpPolicy) {
    const since = new Date(now.getTime() - policy.reminderHours * 3_600_000);
    const pending = await prisma.adoptionRequest.findMany({
      where: { stage: "PENDING", closedAt: null, lastActivityAt: { lte: since } },
      select: { id: true, lastActivityAt: true, pet: { select: { ownerId: true } } },
    });
    const data = pending.flatMap((r) => {
      const idle = Math.floor((now.getTime() - r.lastActivityAt.getTime()) / 3_600_000);
      return dueEvents(idle, r.pet.ownerId, policy).map((e) => ({ ...e, requestId: r.id, activityAt: r.lastActivityAt }));
    });
    const { count } = data.length ? await prisma.notificationEvent.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { scanned: pending.length, created: count };
  },

};
