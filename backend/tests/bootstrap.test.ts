// scripts/grant-super-admin.ts — แต่งตั้ง SUPER_ADMIN คนแรก (ฐานข้อมูลหลักของเทสต์ ยังไม่มีผู้ดูแล)
import { describe, expect, it } from "vitest";
import { DEMO_USERS } from "./demo-users.js";

const { prisma } = await import("../src/config/prisma.js");
const { bootstrapSuperAdmin, BootstrapError } = await import("../scripts/grant-super-admin.js");

const mind = DEMO_USERS.find((u) => u.key === "mind")!;
const shelter = DEMO_USERS.find((u) => u.key === "shelter")!;

describe("bootstrapSuperAdmin", () => {
  it("rejects input that is not an explicit existing account UUID", async () => {
    await expect(bootstrapSuperAdmin(prisma, { userId: "mind@pawhome.test" })).rejects.toThrow(BootstrapError);
    await expect(bootstrapSuperAdmin(prisma, { userId: "" })).rejects.toThrow(/UUID/);
    await expect(bootstrapSuperAdmin(prisma, { userId: "00000000-0000-4000-8000-0000000000ff" })).rejects.toThrow(/ไม่พบบัญชี/);
  });

  it("refuses demo accounts unless --allow-demo", async () => {
    await expect(bootstrapSuperAdmin(prisma, { userId: mind.id })).rejects.toThrow(/demo/);
    expect(await prisma.adminMembership.count()).toBe(0);
  });

  it("grants SUPER_ADMIN once, with an audit event, then refuses a second bootstrap", async () => {
    const result = await bootstrapSuperAdmin(prisma, { userId: mind.id, allowDemo: true });
    expect(result).toMatchObject({ userId: mind.id, email: mind.email });
    expect(await prisma.adminMembership.findUnique({ where: { userId: mind.id } })).toMatchObject({ role: "SUPER_ADMIN" });
    const audit = await prisma.adminAuditLog.findFirst({ where: { action: "admin.bootstrap_super_admin", targetId: mind.id } });
    expect(audit).toMatchObject({ actorRole: "BOOTSTRAP_SCRIPT", result: "SUCCESS" });

    await expect(bootstrapSuperAdmin(prisma, { userId: shelter.id, allowDemo: true })).rejects.toThrow(/มี SUPER_ADMIN อยู่แล้ว/);
    expect(await prisma.adminMembership.findUnique({ where: { userId: shelter.id } })).toBeNull();
  });

  it("is not reachable over HTTP", async () => {
    const { default: request } = await import("supertest");
    const { app } = await import("../src/app.js");
    for (const path of ["/api/admin/bootstrap", "/api/bootstrap", "/api/admin/admins/bootstrap"]) {
      expect([401, 404]).toContain((await request(app).post(path).send({ userId: shelter.id })).status);
    }
    expect(await prisma.adminMembership.findUnique({ where: { userId: shelter.id } })).toBeNull();
  });
});
