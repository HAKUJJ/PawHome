import { prisma } from "../config/prisma.js";

export const profilesRepository = {
  findById: (id: string) => prisma.profile.findUnique({ where: { id } }),

  // ใช้ตรวจสิทธิ์ทุก request: มี suspension = ถูกระงับ
  findWithSuspension: (id: string) =>
    prisma.profile.findUnique({ where: { id }, include: { suspension: { select: { userId: true } } } }),

  // ใช้เฉพาะตอนไม่มี profile (trigger ไม่ทำงาน) · ชนกับ trigger พร้อมกันก็ไม่ error
  updateName: (id: string, name: string) => prisma.profile.update({ where: { id }, data: { name } }),

  create: (id: string, name: string) => prisma.profile.upsert({ where: { id }, create: { id, name }, update: {} }),
};
