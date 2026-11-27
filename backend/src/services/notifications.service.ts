// แจ้งเตือนในเว็บ (notification_events) — สร้างใน transaction เดียวกับเหตุการณ์ · ไม่ส่งอีเมล/SMS
// กันซ้ำด้วย unique index ในฐานข้อมูล + skipDuplicates (กดซ้ำ / cron รันซ้ำ / seed รันซ้ำ ไม่สร้างแถวเพิ่ม)
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../middleware/error.js";

type Db = Prisma.TransactionClient;

export type NotificationKind =
  | "OWNER_REMINDER" | "OWNER_SECOND_REMINDER" | "ADMIN_FOLLOW_UP" | "ESCALATION"
  | "NEW_REQUEST" | "REQUEST_ACCEPTED" | "REQUEST_REJECTED" | "REQUEST_CANCELLED" | "HANDOVER_ARRANGED"
  | "HANDOVER_REPORTED" | "HANDOVER_CONFIRMED" | "HANDOVER_DISPUTED" | "ADOPTION_COMPLETED"
  | "ANNOUNCEMENT_PUBLISHED";

export interface NotificationInput {
  recipientId: string | null;
  kind: NotificationKind;
  requestId?: number;
  announcementId?: number;
  activityAt?: Date;
}

// ข้อความที่หน้าเว็บแสดง (Backend เป็นแหล่งเดียว หน้าเว็บไม่ต้องแปลรหัสเอง)
const TITLE: Record<NotificationKind, string> = {
  OWNER_REMINDER: "มีคำขอรับเลี้ยงรอคุณตอบกลับ",
  OWNER_SECOND_REMINDER: "คำขอรับเลี้ยงรอคุณตอบกลับเกิน 48 ชั่วโมง",
  ADMIN_FOLLOW_UP: "เคสต้องติดตาม (เจ้าของไม่ตอบ 48 ชม.)",
  ESCALATION: "เคสเร่งด่วน (เจ้าของไม่ตอบ 72 ชม.)",
  NEW_REQUEST: "มีคำขอรับเลี้ยงใหม่",
  REQUEST_ACCEPTED: "เจ้าของตอบรับคำขอของคุณแล้ว",
  REQUEST_REJECTED: "คำขอรับเลี้ยงไม่ผ่าน",
  REQUEST_CANCELLED: "ผู้ขอยกเลิกคำขอรับเลี้ยง",
  HANDOVER_ARRANGED: "เริ่มนัดหมายส่งมอบน้องแล้ว",
  HANDOVER_REPORTED: "อีกฝ่ายรายงานการส่งมอบแล้ว รอคุณตรวจสอบ",
  HANDOVER_CONFIRMED: "อีกฝ่ายยืนยันรายละเอียดการส่งมอบแล้ว",
  HANDOVER_DISPUTED: "ข้อมูลการส่งมอบไม่ตรงกัน ผู้ดูแลจะช่วยตรวจสอบ",
  ADOPTION_COMPLETED: "รับเลี้ยงสำเร็จ",
  ANNOUNCEMENT_PUBLISHED: "ประกาศใหม่จาก PawHome",
};

export const notificationsService = {
  async notify(db: Db, entries: NotificationInput[]) {
    const data = entries
      .filter((e) => e.recipientId !== undefined)
      .map((e) => ({
        recipientId: e.recipientId,
        kind: e.kind,
        requestId: e.requestId ?? null,
        announcementId: e.announcementId ?? null,
        activityAt: e.activityAt ?? new Date(),
      }));
    if (data.length) await db.notificationEvent.createMany({ data, skipDuplicates: true });
  },

  // ผู้ใช้เห็นเฉพาะแจ้งเตือนของตัวเอง (recipient_id = ผู้ใช้) · ของคิวผู้ดูแล (recipient null) ไม่แสดงที่นี่
  async listForUser(userId: string, limit = 30) {
    const [rows, unread] = await Promise.all([
      prisma.notificationEvent.findMany({
        where: { recipientId: userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          request: { select: { id: true, pet: { select: { id: true, name: true } } } },
          announcement: { select: { id: true, title: true, destination: true } },
        },
      }),
      prisma.notificationEvent.count({ where: { recipientId: userId, readAt: null } }),
    ]);
    return {
      unread,
      items: rows.map((r) => ({
        id: String(r.id),
        kind: r.kind,
        title: TITLE[r.kind as NotificationKind] ?? r.kind,
        message: r.request ? `น้อง${r.request.pet.name}` : r.announcement?.title ?? "",
        requestId: r.request?.id ?? null,
        petId: r.request?.pet.id ?? null,
        link: r.request ? `/pets/${r.request.pet.id}` : r.announcement?.destination ?? "/",
        createdAt: r.createdAt.toISOString(),
        read: Boolean(r.readAt),
      })),
    };
  },

  async markRead(userId: string, id: bigint) {
    // เงื่อนไข recipient อยู่ใน where เดียวกัน → อ่านของคนอื่นไม่ได้ (ตอบ 404 เหมือนไม่มี)
    const { count } = await prisma.notificationEvent.updateMany({ where: { id, recipientId: userId }, data: { readAt: new Date() } });
    if (!count) throw new ApiError(404, "ไม่พบการแจ้งเตือน");
  },

  async markAllRead(userId: string) {
    const { count } = await prisma.notificationEvent.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: count };
  },
};
