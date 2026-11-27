// สิทธิ์ผู้ดูแล: role มาจากตาราง admin_memberships ในฐานข้อมูลทุก request (ไม่เชื่อค่าจาก client / localStorage / อีเมล)
// ใช้ต่อจาก requireAuth เสมอ
import type { RequestHandler, Response } from "express";
import { prisma } from "../config/prisma.js";
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
] as const;
export type Permission = (typeof ADMIN_PERMISSIONS)[number];

// SUPER_ADMIN = ผู้ดูแลคนแรกจาก scripts/grant-super-admin.ts · สิทธิ์ในหน้า admin เท่ากัน
export const PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: ADMIN_PERMISSIONS,
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

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (_req, res, next) => {
    if (!currentAdmin(res).permissions.includes(permission)) throw new ApiError(403, "สิทธิ์ของคุณไม่พอสำหรับการกระทำนี้");
    next();
  };

export const currentAdmin = (res: Response): Admin => res.locals.admin as Admin;
