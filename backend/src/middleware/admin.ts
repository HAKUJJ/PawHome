// สิทธิ์ผู้ดูแล: role มาจากตาราง admin_memberships ในฐานข้อมูลทุก request (ไม่เชื่อค่าจาก client / localStorage / อีเมล)
// ใช้ต่อจาก requireAuth เสมอ
import type { RequestHandler, Response } from "express";
import { prisma } from "../config/prisma.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { currentUser } from "./auth.js";
import { ApiError } from "./error.js";

export type AdminRole = "ADMIN" | "SUPER_ADMIN";

const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "pets.read",
  "pets.moderate",
  "adoptions.read",
  "adoptions.follow_up",
  "adoptions.resolve",
  "users.read",
  "users.suspend",
  "announcements.manage",
  "reports.read",
  "audit.read",
] as const;
export type Permission = (typeof ADMIN_PERMISSIONS)[number] | "admins.manage";

export const PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: [...ADMIN_PERMISSIONS, "admins.manage"],
};

export interface Admin {
  id: string;
  name: string;
  role: AdminRole;
  permissions: readonly Permission[];
}

export const requireAdmin: RequestHandler = async (_req, res, next) => {
  const user = currentUser(res);
  const membership = await prisma.adminMembership.findUnique({ where: { userId: user.id } });
  if (!membership) throw new ApiError(403, "บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแล");
  const role = membership.role as AdminRole;
  res.locals.admin = { id: user.id, name: user.name, role, permissions: PERMISSIONS[role] } satisfies Admin;
  next();
};

// ผู้ดูแลที่พยายามทำเกินสิทธิ์ → บันทึก DENIED ใน audit log แล้วตอบ 403
export const requirePermission =
  (permission: Permission): RequestHandler =>
  async (req, res, next) => {
    const admin = currentAdmin(res);
    if (!admin.permissions.includes(permission)) {
      await auditRepository.record(prisma, admin, {
        action: "permission.denied",
        targetType: "route",
        targetId: `${req.method} ${req.baseUrl}${req.route?.path ?? ""}`,
        result: "DENIED",
        changes: { permission },
      });
      throw new ApiError(403, "สิทธิ์ของคุณไม่พอสำหรับการกระทำนี้");
    }
    next();
  };

export const currentAdmin = (res: Response): Admin => res.locals.admin as Admin;
