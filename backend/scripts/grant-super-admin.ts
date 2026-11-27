// แต่งตั้ง SUPER_ADMIN คนแรก (ครั้งเดียว) — รันด้วยมือเท่านั้น ไม่มี API และไม่รันตอน server เริ่ม
//
//   npm run admin:bootstrap -- --user <uuid> --confirm-host <hostname ของ DATABASE_URL>
//
// กันพลาด:
// - ต้องระบุ UUID ของบัญชีเป้าหมายเอง (ไม่ค้นจากอีเมล ไม่เลือกบัญชีให้)
// - ต้องพิมพ์ hostname ของฐานข้อมูลที่จะเขียนให้ตรง (กันรันผิดฐานข้อมูล) — สคริปต์แสดง host ให้ดูก่อนเสมอ
// - บัญชี @pawhome.test (demo) ถูกปฏิเสธ เว้นแต่ใส่ --allow-demo (ใช้กับฐานข้อมูล dev/test เท่านั้น)
// - มี SUPER_ADMIN อยู่แล้ว = หยุด (คนต่อไปให้ SUPER_ADMIN แต่งตั้งผ่าน PUT /api/admin/admins/:userId)
// ดูขั้นตอนเต็ม: docs/admin-super-admin-bootstrap.md
import type { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BootstrapError extends Error {}

export async function bootstrapSuperAdmin(db: PrismaClient, options: { userId: string; allowDemo?: boolean }) {
  const { userId, allowDemo = false } = options;
  if (!UUID.test(userId)) throw new BootstrapError("--user ต้องเป็น UUID ของบัญชีใน Supabase Auth");

  return db.$transaction(async (tx) => {
    const [account] = await tx.$queryRaw<{ email: string | null }[]>`select email from auth.users where id = ${userId}::uuid`;
    const profile = await tx.profile.findUnique({ where: { id: userId }, include: { adminMembership: true } });
    if (!account || !profile) throw new BootstrapError("ไม่พบบัญชีนี้ (ต้องสมัครและยืนยันอีเมลใน PawHome ก่อน)");
    if (!allowDemo && account.email?.toLowerCase().endsWith("@pawhome.test")) {
      throw new BootstrapError("ปฏิเสธบัญชี demo (@pawhome.test) — ใส่ --allow-demo เฉพาะฐานข้อมูล dev/test");
    }
    const existing = await tx.adminMembership.findFirst({ where: { role: "SUPER_ADMIN" } });
    if (existing) throw new BootstrapError("มี SUPER_ADMIN อยู่แล้ว (แต่งตั้งได้ครั้งเดียว)");

    await tx.adminMembership.upsert({
      where: { userId },
      create: { userId, role: "SUPER_ADMIN" },
      update: { role: "SUPER_ADMIN" },
    });
    return { userId, name: profile.name, email: account.email };
  });
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const userId = arg("--user") ?? "";
  const confirmHost = arg("--confirm-host");
  const allowDemo = process.argv.includes("--allow-demo");

  const { env } = await import("../src/config/env.js");
  const host = new URL(env.DATABASE_URL).hostname; // แสดงเฉพาะ host ไม่แสดงรหัสผ่าน
  console.log(`ฐานข้อมูลเป้าหมาย: ${host}`);
  if (confirmHost !== host) {
    console.error(`หยุด: ต้องใส่ --confirm-host ${host} เพื่อยืนยันว่าตั้งใจเขียนฐานข้อมูลนี้`);
    process.exit(2);
  }
  const { prisma } = await import("../src/config/prisma.js");
  try {
    const result = await bootstrapSuperAdmin(prisma, { userId, allowDemo });
    console.log(`แต่งตั้ง SUPER_ADMIN แล้ว: ${result.name} (${result.userId})`);
  } catch (error) {
    console.error(error instanceof BootstrapError ? `หยุด: ${error.message}` : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
