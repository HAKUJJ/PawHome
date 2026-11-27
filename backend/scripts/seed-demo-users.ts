// สร้างบัญชีทดสอบ 40 บัญชีของชุดข้อมูล pawhome-demo-v1 ผ่าน Supabase Auth Admin API (ไม่ insert ลง auth.users ตรง)
// Development / Test เท่านั้น — มีด่านกันรันผิดโปรเจกต์:
//   SEED_TARGET=development
//   SEED_ALLOWED_PROJECT_REFS=<project-ref ของ Supabase Development>   (ต้องตรงกับ SUPABASE_URL)
//   DEMO_USER_PASSWORD=<รหัสผ่านทดสอบ อย่างน้อย 12 ตัวอักษร>          (ไม่ hardcode · ไม่แสดงใน log)
//   cd backend && npm run seed:demo-users                      (ชุดใหญ่ 40 บัญชี)
//   cd backend && npm run seed:demo-users -- --dataset minimal (ชุดสาธิตเล็ก 6 บัญชี)
// รันซ้ำได้: บัญชีที่มีอยู่แล้วข้าม (ไม่เปลี่ยนรหัสผ่าน) · ยืนยันอีเมลให้ผ่าน Admin API จึงไม่ส่งอีเมลจริง
// ไม่แต่งตั้งผู้ดูแล: role ทดสอบอยู่ใน database/seeds/001-demo-profiles.sql (มี guard ไม่ให้รันบนฐานข้อมูลที่มีข้อมูลจริง)
import { DEMO_DATASET_USERS, MINIMAL_DATASET_USERS } from "./demo-dataset.js";

export function checkSeedEnvironment(env: NodeJS.ProcessEnv): { projectRef: string; password: string } {
  const problems: string[] = [];
  if (env.SEED_TARGET !== "development") problems.push("ต้องตั้ง SEED_TARGET=development");
  if (env.VERCEL || env.NODE_ENV === "production") problems.push("ห้ามรันบน Vercel / NODE_ENV=production");
  let projectRef = "";
  try {
    projectRef = new URL(env.SUPABASE_URL ?? "").hostname.split(".")[0];
  } catch {
    problems.push("SUPABASE_URL ไม่ถูกต้อง");
  }
  const allowed = (env.SEED_ALLOWED_PROJECT_REFS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) problems.push("ต้องตั้ง SEED_ALLOWED_PROJECT_REFS (project ref ของ Supabase Development)");
  else if (!allowed.includes(projectRef)) problems.push(`project ref "${projectRef}" ไม่อยู่ใน SEED_ALLOWED_PROJECT_REFS`);
  const password = env.DEMO_USER_PASSWORD ?? "";
  if (password.length < 12) problems.push("DEMO_USER_PASSWORD ต้องยาวอย่างน้อย 12 ตัวอักษร");
  if (problems.length) throw new Error(`หยุด (ไม่ได้สร้างบัญชีใด ๆ): ${problems.join(" · ")}`);
  return { projectRef, password };
}

async function main() {
  const { projectRef, password } = checkSeedEnvironment(process.env);
  const minimal = process.argv.includes("minimal");
  const users = minimal ? MINIMAL_DATASET_USERS : DEMO_DATASET_USERS;
  const { supabaseAdmin } = await import("../src/config/supabase.js");
  console.log(`โปรเจกต์ Supabase: ${projectRef} · สร้าง ${users.length} บัญชี (@pawhome.test)`);
  let failed = 0;
  for (const u of users) {
    const { error } = await supabaseAdmin.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { name: u.name } });
    if (!error) console.log(`created  ${u.email}`);
    else if (error.code === "email_exists" || error.code === "user_already_exists") console.log(`exists   ${u.email}`);
    else {
      failed++;
      console.error(`failed   ${u.email}: ${error.message}`);
    }
  }
  console.log(failed ? `ไม่สำเร็จ ${failed} บัญชี` : minimal ? "เสร็จ — ต่อด้วย database/seeds/minimal/seed.sql" : "เสร็จ — ต่อด้วย database/seeds/001…010 (ดู docs/mock-data-guide.md)");
  process.exitCode = failed ? 1 : 0;
}

import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
