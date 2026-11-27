// ประกาศ/ประชาสัมพันธ์: ผู้ดูแลสร้าง แก้ เผยแพร่ ยกเลิกเผยแพร่ จัดลำดับ · หน้าเว็บอ่านเฉพาะที่เผยแพร่แล้ว
// รูปต้องเป็นไฟล์ที่ผู้ดูแลคนนั้นอัปโหลดผ่าน /api/uploads เท่านั้น · ปลายทางต้องเป็นลิงก์ภายในเว็บ
import type { Announcement } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { Admin } from "../middleware/admin.js";
import { ApiError } from "../middleware/error.js";
import type { AdminAnnouncement } from "../types/admin.js";
import type { AnnouncementCreate, AnnouncementUpdate } from "../validators/admin.validator.js";
import { notificationsService } from "./notifications.service.js";
import { isOwnUpload } from "./uploads.service.js";

function toAnnouncement(row: Announcement): AdminAnnouncement {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    eventDate: row.eventDate?.toISOString().slice(0, 10) ?? null,
    eventTime: row.eventTime,
    location: row.location,
    contact: row.contact,
    cta: row.cta,
    destination: row.destination,
    imageUrl: row.imageUrl,
    status: row.status as AdminAnnouncement["status"],
    displayOrder: row.displayOrder,
    isDemo: row.isDemo,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishAt: row.publishAt?.toISOString() ?? null,
    expireAt: row.expireAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const order = [{ displayOrder: "asc" as const }, { id: "asc" as const }];

function checkImage(admin: Admin, imageUrl: string | undefined, current = "") {
  // รูปเดิมที่ไม่ได้เปลี่ยน ผ่านได้ (อาจเป็นของผู้ดูแลคนอื่นที่อัปโหลดไว้)
  if (imageUrl && imageUrl !== current && !isOwnUpload(imageUrl, admin.id)) {
    throw new ApiError(400, "รูปประกาศต้องเป็นไฟล์ที่คุณอัปโหลดผ่าน PawHome");
  }
}

const toDate = (value: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

const toTime = (value: string | null | undefined) => (value === undefined ? undefined : value ? new Date(value) : null);

function toData<T extends AnnouncementUpdate>(input: T) {
  const { eventDate, publishAt, expireAt, ...rest } = input;
  return {
    ...rest,
    ...(eventDate !== undefined ? { eventDate: toDate(eventDate) } : {}),
    ...(publishAt !== undefined ? { publishAt: toTime(publishAt) } : {}),
    ...(expireAt !== undefined ? { expireAt: toTime(expireAt) } : {}),
  };
}

// เผยแพร่ครั้งแรก → แจ้งเตือนในเว็บถึงผู้ใช้ทุกคน (ไม่ส่งอีเมล) · ประกาศตัวอย่าง (isDemo) ไม่แจ้ง
// shortcut: สร้างแถวต่อผู้ใช้ใน transaction เดียว, ถ้าผู้ใช้เกินหลักหมื่นให้ย้ายไปทำเป็นงานเบื้องหลัง
async function announceToUsers(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], row: Announcement) {
  if (row.isDemo) return;
  const users = await tx.profile.findMany({ select: { id: true } });
  await notificationsService.notify(tx, users.map((u) => ({ recipientId: u.id, kind: "ANNOUNCEMENT_PUBLISHED" as const, announcementId: row.id })));
}

// หน้าเว็บเห็นเฉพาะที่เผยแพร่แล้วและอยู่ในช่วงเวลา (ตรงกับ RLS policy ใน migration 002)
const live = (now = new Date()) => ({
  status: "PUBLISHED",
  AND: [{ OR: [{ publishAt: null }, { publishAt: { lte: now } }] }, { OR: [{ expireAt: null }, { expireAt: { gt: now } }] }],
});

export const announcementsService = {
  // สาธารณะ: เผยแพร่แล้วเท่านั้น · ข้อมูลตัวอย่างมี isDemo ให้หน้าเว็บแสดงป้ายกำกับ
  async listPublished() {
    const rows = await prisma.announcement.findMany({ where: live(), orderBy: order });
    return rows.map(toAnnouncement);
  },

  listAll: async () => (await prisma.announcement.findMany({ orderBy: order })).map(toAnnouncement),

  create(admin: Admin, input: AnnouncementCreate): Promise<AdminAnnouncement> {
    checkImage(admin, input.imageUrl);
    return prisma.$transaction(async (tx) => {
      const row = await tx.announcement.create({
        data: { ...input, eventDate: toDate(input.eventDate), publishAt: toTime(input.publishAt), expireAt: toTime(input.expireAt), createdBy: admin.id, updatedBy: admin.id, publishedAt: input.status === "PUBLISHED" ? new Date() : null },
      });
      if (row.status === "PUBLISHED") await announceToUsers(tx, row);
      return toAnnouncement(row);
    });
  },

  update(admin: Admin, id: number, input: AnnouncementUpdate): Promise<AdminAnnouncement> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.announcement.findUnique({ where: { id } });
      if (!before) throw new ApiError(404, "ไม่พบประกาศ");
      checkImage(admin, input.imageUrl, before.imageUrl);
      const publishing = input.status === "PUBLISHED" && before.status !== "PUBLISHED";
      const row = await tx.announcement.update({
        where: { id },
        data: { ...toData(input), updatedBy: admin.id, ...(publishing ? { publishedAt: new Date() } : {}), ...(input.status === "DRAFT" ? { publishedAt: null } : {}) },
      });
      if (publishing) await announceToUsers(tx, row);
      return toAnnouncement(row);
    });
  },

  // ลบได้เฉพาะฉบับร่าง (ที่เผยแพร่แล้วต้องยกเลิกเผยแพร่ก่อน กันลบสิ่งที่ผู้ใช้กำลังเห็นโดยไม่ตั้งใจ)
  remove(id: number): Promise<void> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.announcement.findUnique({ where: { id } });
      if (!row) throw new ApiError(404, "ไม่พบประกาศ");
      if (row.status === "PUBLISHED") throw new ApiError(409, "ยกเลิกการเผยแพร่ก่อนลบประกาศ");
      await tx.announcement.delete({ where: { id } });
    });
  },
};
