// งานผู้ดูแล: ภาพรวม · ตรวจโพสต์ · ผู้ใช้ · สิทธิ์ผู้ดูแล · รายงาน · audit log
// ทุกการเปลี่ยนแปลงบันทึก admin_audit_logs ใน transaction เดียวกัน · read model เฉพาะหน้า admin เรียก Prisma ตรง
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import type { Admin, AdminRole } from "../middleware/admin.js";
import { ApiError } from "../middleware/error.js";
import { auditRepository } from "../repositories/audit.repository.js";
import type { AdminMe, AdminPet, AdminRoleName, AdminUser, AuditLogEntry, Paged } from "../types/admin.js";
import type { PetStatus, PetVisibility, Sex, Species, User } from "../types/dto.js";
import type { ModerationInput, PetFiltersAdmin, ReportRange, UserFilters } from "../validators/admin.validator.js";
import { ACTIVE_STAGES, STAGES, followUp } from "./adoption-workflow.js";
import { followUpPolicy } from "./follow-up.service.js";

const petInclude = {
  owner: { select: { name: true } },
  adoptionRequests: { select: { stage: true } },
} satisfies Prisma.PetInclude;
type PetRow = Prisma.PetGetPayload<{ include: typeof petInclude }>;

function toAdminPet(row: PetRow): AdminPet {
  return {
    id: row.id,
    name: row.name,
    species: row.species as Species,
    breed: row.breed,
    sex: row.sex as Sex,
    ageMonths: row.ageMonths,
    province: row.province,
    description: row.description,
    imageUrl: row.imageUrl,
    vaccinated: row.vaccinated,
    sterilized: row.sterilized,
    urgent: row.urgent,
    status: row.status as PetStatus,
    visibility: row.visibility as PetVisibility,
    moderationReason: row.moderationReason,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    createdAt: row.createdAt.toISOString(),
    requestCount: row.adoptionRequests.length,
    openRequestCount: row.adoptionRequests.filter((r) => (ACTIVE_STAGES as readonly string[]).includes(r.stage)).length,
  };
}

async function findPetRow(id: number, db: Prisma.TransactionClient = prisma) {
  const row = await db.pet.findUnique({ where: { id }, include: petInclude });
  if (!row) throw new ApiError(404, "ไม่พบโพสต์");
  return row;
}

const userInclude = {
  adminMembership: { select: { role: true } },
  suspension: { select: { reason: true } },
  _count: { select: { pets: true } },
  adoptionRequests: { where: { stage: { in: [...ACTIVE_STAGES] } }, select: { id: true } },
} satisfies Prisma.ProfileInclude;
type UserRow = Prisma.ProfileGetPayload<{ include: typeof userInclude }>;

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    role: (row.adminMembership?.role ?? "USER") as AdminRoleName,
    suspended: Boolean(row.suspension),
    suspendedReason: row.suspension?.reason ?? "",
    joinedAt: row.createdAt.toISOString(),
    petCount: row._count.pets,
    openRequestCount: row.adoptionRequests.length,
  };
}

const paged = <T>(items: T[], total: number, page: number, limit: number): Paged<T> => ({ items, total, page, limit });

export const adminService = {
  me(user: User, admin: Admin): AdminMe {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: admin.role,
      permissions: admin.permissions,
      workflow: { handoverEnabled: env.ADOPTION_HANDOVER_WORKFLOW, ...followUpPolicy },
    };
  },

  // ---------- ภาพรวม ----------
  async dashboard(now = new Date()) {
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [byStage, open, petsByVisibility, completedThisMonth, users, suspended, recent] = await Promise.all([
      prisma.adoptionRequest.groupBy({ by: ["stage"], _count: { _all: true } }),
      prisma.adoptionRequest.findMany({
        where: { OR: [{ stage: { in: [...ACTIVE_STAGES] } }, { legacyReview: true }], closedAt: null },
        select: { stage: true, lastActivityAt: true, followUpRequired: true, escalated: true, disputed: true, legacyReview: true, closedAt: true },
      }),
      prisma.pet.groupBy({ by: ["visibility"], _count: { _all: true } }),
      prisma.adoptionRequest.count({ where: { stage: "COMPLETED", completedAt: { gte: startOfMonth } } }),
      prisma.profile.count(),
      prisma.userSuspension.count(),
      auditRepository.list({ page: 1, limit: 5 }),
    ]);
    const policies = open.map((r) => followUp(r, now, followUpPolicy));
    const stages = Object.fromEntries(STAGES.map((s) => [s, byStage.find((b) => b.stage === s)?._count._all ?? 0]));
    const visibility = Object.fromEntries(["VISIBLE", "HIDDEN", "CHANGES_REQUESTED", "REVIEW"].map((v) => [v, petsByVisibility.find((p) => p.visibility === v)?._count._all ?? 0]));
    return {
      stages,
      followUp: {
        required: policies.filter((p) => p.required).length,
        overdue: policies.filter((p) => p.overdue).length,
        urgent: policies.filter((p) => p.priority === "urgent").length,
        high: policies.filter((p) => p.priority === "high").length,
        reminder: policies.filter((p) => p.priority === "reminder").length,
        disputed: open.filter((r) => r.disputed).length,
        legacyReview: open.filter((r) => r.legacyReview).length,
      },
      pets: { ...visibility, needsReview: (visibility.REVIEW ?? 0) + (visibility.CHANGES_REQUESTED ?? 0) },
      completedThisMonth,
      users: { total: users, suspended },
      recentAudit: await withActorNames(recent.rows),
    };
  },

  // ---------- โพสต์ ----------
  async listPets(filters: PetFiltersAdmin): Promise<Paged<AdminPet>> {
    const where: Prisma.PetWhereInput = {};
    if (filters.visibility) where.visibility = filters.visibility;
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { province: { contains: filters.q, mode: "insensitive" } },
        { owner: { name: { contains: filters.q, mode: "insensitive" } } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.pet.findMany({ where, include: petInclude, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.limit, take: filters.limit }),
      prisma.pet.count({ where }),
    ]);
    return paged(rows.map(toAdminPet), total, filters.page, filters.limit);
  },

  getPet: async (id: number) => toAdminPet(await findPetRow(id)),

  // ซ่อน / แสดงโพสต์ (ไม่ลบข้อมูล)
  setPetVisibility(admin: Admin, id: number, visibility: "VISIBLE" | "HIDDEN", reason: string): Promise<AdminPet> {
    return prisma.$transaction(async (tx) => {
      const before = await findPetRow(id, tx);
      if (before.visibility === visibility) throw new ApiError(409, visibility === "HIDDEN" ? "โพสต์นี้ถูกซ่อนอยู่แล้ว" : "โพสต์นี้แสดงอยู่แล้ว");
      await tx.pet.update({ where: { id }, data: { visibility, moderationReason: reason, moderatedAt: new Date(), moderatedBy: admin.id } });
      await auditRepository.record(tx, admin, {
        action: visibility === "HIDDEN" ? "pet.hide" : "pet.show", targetType: "pet", targetId: id,
        changes: { visibility: { from: before.visibility, to: visibility } }, reason,
      });
      return toAdminPet(await findPetRow(id, tx));
    });
  },

  // ผลตรวจโพสต์: อนุมัติ (แสดง) · ส่งกลับให้เจ้าของแก้ไขพร้อมเหตุผล (ซ่อนจนเจ้าของแก้แล้วส่งตรวจใหม่)
  moderatePet(admin: Admin, id: number, input: ModerationInput): Promise<AdminPet> {
    return prisma.$transaction(async (tx) => {
      const before = await findPetRow(id, tx);
      const visibility = input.decision === "APPROVE" ? "VISIBLE" : "CHANGES_REQUESTED";
      const moderationReason = input.decision === "APPROVE" ? "" : input.reason;
      await tx.pet.update({ where: { id }, data: { visibility, moderationReason, moderatedAt: new Date(), moderatedBy: admin.id } });
      await auditRepository.record(tx, admin, {
        action: input.decision === "APPROVE" ? "pet.approve" : "pet.request_changes", targetType: "pet", targetId: id,
        changes: { visibility: { from: before.visibility, to: visibility } }, reason: input.reason,
      });
      return toAdminPet(await findPetRow(id, tx));
    });
  },

  // ---------- ผู้ใช้ ----------
  async listUsers(filters: UserFilters): Promise<Paged<AdminUser>> {
    const where: Prisma.ProfileWhereInput = {};
    if (filters.q) where.name = { contains: filters.q, mode: "insensitive" };
    if (filters.status === "suspended") where.suspension = { isNot: null };
    if (filters.status === "active") where.suspension = { is: null };
    if (filters.role === "USER") where.adminMembership = { is: null };
    else if (filters.role) where.adminMembership = { is: { role: filters.role } };
    const [rows, total] = await Promise.all([
      prisma.profile.findMany({ where, include: userInclude, orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.limit, take: filters.limit }),
      prisma.profile.count({ where }),
    ]);
    return paged(rows.map(toAdminUser), total, filters.page, filters.limit);
  },

  async getUser(id: string) {
    const row = await prisma.profile.findUnique({ where: { id }, include: userInclude });
    if (!row) throw new ApiError(404, "ไม่พบผู้ใช้");
    const [pets, requests] = await Promise.all([
      prisma.pet.findMany({ where: { ownerId: id }, include: petInclude, orderBy: { createdAt: "desc" } }),
      prisma.adoptionRequest.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { id: true, stage: true, createdAt: true, pet: { select: { id: true, name: true } } } }),
    ]);
    return {
      ...toAdminUser(row),
      pets: pets.map(toAdminPet),
      requests: requests.map((r) => ({ id: r.id, stage: r.stage, createdAt: r.createdAt.toISOString(), petId: r.pet.id, petName: r.pet.name })),
    };
  },

  // ผู้ดูแลระงับตัวเองหรือผู้ดูแลคนอื่นไม่ได้ (SUPER_ADMIN ต้องถอดสิทธิ์ก่อน)
  suspendUser(admin: Admin, id: string, reason: string): Promise<AdminUser> {
    return prisma.$transaction(async (tx) => {
      if (id === admin.id) throw new ApiError(400, "ระงับบัญชีตัวเองไม่ได้");
      const target = await tx.profile.findUnique({ where: { id }, include: userInclude });
      if (!target) throw new ApiError(404, "ไม่พบผู้ใช้");
      if (target.adminMembership) throw new ApiError(403, "ระงับบัญชีผู้ดูแลไม่ได้ ต้องถอดสิทธิ์ผู้ดูแลก่อน");
      if (target.suspension) throw new ApiError(409, "บัญชีนี้ถูกระงับอยู่แล้ว");
      await tx.userSuspension.create({ data: { userId: id, reason, suspendedBy: admin.id } });
      await auditRepository.record(tx, admin, { action: "user.suspend", targetType: "user", targetId: id, reason });
      return toAdminUser((await tx.profile.findUnique({ where: { id }, include: userInclude }))!);
    });
  },

  unsuspendUser(admin: Admin, id: string): Promise<AdminUser> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.userSuspension.deleteMany({ where: { userId: id } });
      if (!count) throw new ApiError(409, "บัญชีนี้ไม่ได้ถูกระงับ");
      await auditRepository.record(tx, admin, { action: "user.unsuspend", targetType: "user", targetId: id });
      const row = await tx.profile.findUnique({ where: { id }, include: userInclude });
      if (!row) throw new ApiError(404, "ไม่พบผู้ใช้");
      return toAdminUser(row);
    });
  },

  // ---------- สิทธิ์ผู้ดูแล (SUPER_ADMIN เท่านั้น — ตรวจด้วย requirePermission("admins.manage")) ----------
  async listAdmins() {
    const rows = await prisma.adminMembership.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ userId: r.userId, name: r.user.name, role: r.role as AdminRole, grantedBy: r.grantedBy, createdAt: r.createdAt.toISOString() }));
  },

  // แก้สิทธิ์ของตัวเองไม่ได้ (กันยกระดับตัวเอง / ล็อกตัวเองออกจนไม่มี SUPER_ADMIN)
  setAdminRole(admin: Admin, userId: string, role: AdminRole) {
    return prisma.$transaction(async (tx) => {
      if (userId === admin.id) throw new ApiError(400, "เปลี่ยนสิทธิ์ของตัวเองไม่ได้");
      const user = await tx.profile.findUnique({ where: { id: userId }, include: { suspension: true, adminMembership: true } });
      if (!user) throw new ApiError(404, "ไม่พบผู้ใช้");
      if (user.suspension) throw new ApiError(409, "แต่งตั้งบัญชีที่ถูกระงับไม่ได้");
      const before = user.adminMembership?.role ?? "USER";
      await tx.adminMembership.upsert({ where: { userId }, create: { userId, role, grantedBy: admin.id }, update: { role, grantedBy: admin.id } });
      await auditRepository.record(tx, admin, { action: "admin.set_role", targetType: "user", targetId: userId, changes: { role: { from: before, to: role } } });
      return { userId, name: user.name, role };
    });
  },

  revokeAdmin(admin: Admin, userId: string) {
    return prisma.$transaction(async (tx) => {
      if (userId === admin.id) throw new ApiError(400, "ถอดสิทธิ์ของตัวเองไม่ได้");
      const membership = await tx.adminMembership.findUnique({ where: { userId } });
      if (!membership) throw new ApiError(404, "ผู้ใช้นี้ไม่ได้เป็นผู้ดูแล");
      await tx.adminMembership.delete({ where: { userId } });
      await auditRepository.record(tx, admin, { action: "admin.revoke", targetType: "user", targetId: userId, changes: { role: { from: membership.role, to: "USER" } } });
    });
  },

  // ---------- รายงาน ----------
  async report({ start, end }: ReportRange) {
    const inRange = { gte: start, lte: end };
    const [created, completed, rejected, cancelled, accepted, petsCreated, completedRows, species] = await Promise.all([
      prisma.adoptionRequest.count({ where: { createdAt: inRange } }),
      prisma.adoptionRequest.count({ where: { stage: "COMPLETED", completedAt: inRange } }),
      prisma.adoptionStageHistory.count({ where: { toStage: "REJECTED", fromStage: { not: null }, createdAt: inRange } }),
      prisma.adoptionStageHistory.count({ where: { toStage: "CANCELLED", fromStage: { not: null }, createdAt: inRange } }),
      prisma.adoptionStageHistory.count({ where: { toStage: "ACCEPTED", fromStage: "PENDING", createdAt: inRange } }),
      prisma.pet.count({ where: { createdAt: inRange } }),
      prisma.adoptionRequest.findMany({ where: { stage: "COMPLETED", completedAt: inRange }, select: { createdAt: true, completedAt: true } }),
      prisma.pet.groupBy({ by: ["species"], where: { createdAt: inRange }, _count: { _all: true } }),
    ]);
    const days = completedRows.map((r) => (r.completedAt!.getTime() - r.createdAt.getTime()) / 86_400_000);
    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      requests: { created, accepted, completed, rejected, cancelled },
      pets: { created: petsCreated, bySpecies: Object.fromEntries(species.map((s) => [s.species, s._count._all])) },
      averageDaysToComplete: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    };
  },

  // ---------- Audit log (อ่านอย่างเดียว ไม่มี endpoint แก้/ลบ) ----------
  async auditLogs(filters: { action?: string; targetType?: string; targetId?: string; page: number; limit: number }): Promise<Paged<AuditLogEntry>> {
    const { rows, total } = await auditRepository.list(filters);
    return paged(await withActorNames(rows), total, filters.page, filters.limit);
  },
};

type AuditRow = Awaited<ReturnType<typeof auditRepository.list>>["rows"][number];

async function withActorNames(rows: AuditRow[]): Promise<AuditLogEntry[]> {
  const ids = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => Boolean(v)))];
  const names = new Map((await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: String(r.id),
    actorId: r.actorId,
    actorName: r.actorId ? names.get(r.actorId) ?? "ผู้ใช้ที่ถูกลบ" : "ระบบ",
    actorRole: r.actorRole,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    result: r.result,
    changes: r.changes,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}
