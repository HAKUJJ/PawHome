// Audit log แบบ append-only (trigger ในฐานข้อมูลกัน update/delete) · เขียนใน transaction เดียวกับการเปลี่ยนแปลง
// ห้ามใส่ password / token / secret ลงใน changes หรือ reason — ส่งเฉพาะฟิลด์ที่เปลี่ยนจริง
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

type Db = Prisma.TransactionClient;
export interface AuditActor {
  id: string;
  role: string;
}
export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string | number;
  result?: "SUCCESS" | "DENIED" | "FAILED";
  changes?: Prisma.InputJsonObject;
  reason?: string;
}

const SECRET_KEYS = /password|token|secret|authorization|apikey|api_key/i;

// กันพลาด: ตัด key ที่ชื่อดูเหมือนความลับออก แม้ผู้เรียกจะส่งมา
function scrub(changes: Prisma.InputJsonObject = {}): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(changes).filter(([key]) => !SECRET_KEYS.test(key)));
}

export const auditRepository = {
  record: (db: Db, actor: AuditActor, entry: AuditEntry) =>
    db.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        action: entry.action,
        targetType: entry.targetType,
        targetId: String(entry.targetId),
        result: entry.result ?? "SUCCESS",
        changes: scrub(entry.changes),
        reason: entry.reason ?? "",
      },
    }),

  async list(filters: { action?: string; targetType?: string; targetId?: string; page: number; limit: number }) {
    const where: Prisma.AdminAuditLogWhereInput = {};
    if (filters.action) where.action = filters.action;
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.targetId) where.targetId = filters.targetId;
    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({ where, orderBy: { id: "desc" }, skip: (filters.page - 1) * filters.limit, take: filters.limit }),
      prisma.adminAuditLog.count({ where }),
    ]);
    return { rows, total };
  },
};
