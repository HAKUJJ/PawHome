// งานผู้ดูแล: ภาพรวม · ตรวจโพสต์ · ภาพรวมผู้ใช้ · read model เฉพาะหน้า admin เรียก Prisma ตรง
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import type { Admin } from "../middleware/admin.js";
import { ApiError } from "../middleware/error.js";
import type { AdminMe, AdminPet, AdminRoleName, AdminUser, Paged } from "../types/admin.js";
import type { PetStatus, PetVisibility, Sex, Species, User } from "../types/dto.js";
import type { ModerationInput, PetFiltersAdmin, UserFilters } from "../validators/admin.validator.js";
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
  _count: { select: { pets: true } },
  adoptionRequests: { where: { stage: { in: [...ACTIVE_STAGES] } }, select: { id: true } },
} satisfies Prisma.ProfileInclude;
type UserRow = Prisma.ProfileGetPayload<{ include: typeof userInclude }>;

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    role: (row.adminMembership?.role ?? "USER") as AdminRoleName,
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
    const [byStage, open, petsByVisibility, completedThisMonth, users] = await Promise.all([
      prisma.adoptionRequest.groupBy({ by: ["stage"], _count: { _all: true } }),
      prisma.adoptionRequest.findMany({
        where: { OR: [{ stage: { in: [...ACTIVE_STAGES] } }, { legacyReview: true }], closedAt: null },
        select: { stage: true, lastActivityAt: true, followUpRequired: true, disputed: true, legacyReview: true, closedAt: true },
      }),
      prisma.pet.groupBy({ by: ["visibility"], _count: { _all: true } }),
      prisma.adoptionRequest.count({ where: { stage: "COMPLETED", completedAt: { gte: startOfMonth } } }),
      prisma.profile.count(),
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
      users: { total: users },
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
      return toAdminPet(await findPetRow(id, tx));
    });
  },

  // ผลตรวจโพสต์: อนุมัติ (แสดง) · ส่งกลับให้เจ้าของแก้ไขพร้อมเหตุผล (ซ่อนจนเจ้าของแก้แล้วส่งตรวจใหม่)
  moderatePet(admin: Admin, id: number, input: ModerationInput): Promise<AdminPet> {
    return prisma.$transaction(async (tx) => {
      await findPetRow(id, tx);
      const visibility = input.decision === "APPROVE" ? "VISIBLE" : "CHANGES_REQUESTED";
      const moderationReason = input.decision === "APPROVE" ? "" : input.reason;
      await tx.pet.update({ where: { id }, data: { visibility, moderationReason, moderatedAt: new Date(), moderatedBy: admin.id } });
      return toAdminPet(await findPetRow(id, tx));
    });
  },

  // ---------- ผู้ใช้ ----------
  async listUsers(filters: UserFilters): Promise<Paged<AdminUser>> {
    const where: Prisma.ProfileWhereInput = {};
    if (filters.q) where.name = { contains: filters.q, mode: "insensitive" };
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
};
