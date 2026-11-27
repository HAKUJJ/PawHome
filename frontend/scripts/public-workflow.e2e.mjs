// Browser E2E ของเว็บสาธารณะ + ผู้ดูแล บนชุดข้อมูลทดสอบ (Chromium → Vite → Express จริง → PGlite, Auth ปลอม)
// ครอบคลุม: สมัคร · ค้นหา · รายการโปรด · สร้าง/แก้โพสต์ · ขอรับเลี้ยง · ตอบรับ · นัดส่งมอบ · รายงาน · ข้อพิพาท · ยืนยัน
//           ผู้ดูแลตรวจผล · แจ้งเตือน · ประกาศหน้าแรก · รายงาน · มือถือ 390px
//   1) cd backend && E2E_DEMO_DATASET=1 E2E_HANDOVER_WORKFLOW=1 npx tsx --import ./tests/e2e/loader.mjs tests/e2e/server.ts
//   2) cd frontend && VITE_API_URL=http://localhost:3101/api npx vite --port 5182
//   3) PAWHOME_PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/public-workflow.e2e.mjs
// เริ่ม server ข้อ 1 ใหม่ทุกครั้ง (สคริปต์เปลี่ยนข้อมูล)
import assert from "node:assert/strict";

const { chromium, devices } = await import(process.env.PAWHOME_PLAYWRIGHT ?? "playwright");
const base = process.env.PAWHOME_URL ?? "http://localhost:5182";
const apiBase = process.env.PAWHOME_API ?? "http://localhost:3101/api";
const results = [];
let stop = false;
async function step(name, fn) {
  if (stop) { results.push(`SKIP  ${name}`); return; }
  try { await fn(); results.push(`PASS  ${name}`); } catch (error) { results.push(`FAIL  ${name}\n      ${String(error.message).split("\n")[0]}`); stop = true; }
}
async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${apiBase}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const tokenOf = async (email) => (await api("/auth/login", { method: "POST", body: { email, password: "123456" } })).body.token;
async function login(page, email, redirect = "/") {
  await page.goto(`${base}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("123456");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }).catch(async (error) => {
    const text = (await page.locator("main").innerText()).slice(0, 160).split("\n").join(" | ");
    throw new Error(`login ${email} stuck: ${text} (${error.message.split("\n")[0]})`);
  });
}
const noOverflow = async (page) => {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(extra <= 0, `${page.url()} overflowed by ${extra}px`);
};
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && !/status of 40[0-9]|ERR_FAILED|Failed to fetch|broken-image-for-fallback/.test(m.text()) && errors.push(m.text().slice(0, 200)));
};

const OWNER = "demo-09.owner.krit@pawhome.test";
const APPLICANT = "demo-27.applicant.oat@pawhome.test";
const ADMIN = "e2e-admin@pawhome.test";
const PET = `น้องทดสอบ E2E ${Date.now() % 100000}`;
const browser = await chromium.launch();
const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const applicantCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const owner = await ownerCtx.newPage();
const applicant = await applicantCtx.newPage();
watch(owner); watch(applicant);
let petId = 0;
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

await step("dataset: public feed shows seeded pets, hidden ones are excluded", async () => {
  const pets = (await api("/pets")).body;
  assert.ok(pets.length >= 100, `expected ≥100 visible pets, got ${pets.length}`);
  assert.ok(pets.every((p) => p.visibility === "VISIBLE"));
});

await step("register: sign-up asks the user to verify email", async () => {
  const page = await browser.newPage();
  await page.goto(`${base}/register`);
  await page.getByLabel("ชื่อที่แสดง").fill("ผู้ใช้ใหม่ E2E");
  await page.getByLabel("อีเมล").fill(`new-${Date.now()}@pawhome.test`);
  await page.locator("input[type=password]").nth(0).fill("123456");
  await page.locator("input[type=password]").nth(1).fill("123456");
  await page.getByRole("button", { name: "สมัครสมาชิก" }).click();
  await page.getByRole("heading", { name: "ตรวจอีเมลของคุณ" }).waitFor();
  await page.close();
});

await step("owner: create a post, then edit it", async () => {
  await login(owner, OWNER, "/pets/new");
  await owner.getByLabel("ชื่อน้อง *").fill(PET);
  await owner.getByLabel("จังหวัด *").selectOption("ภูเก็ต");
  await owner.getByLabel("อายุ (เดือน) *").fill("8");
  await owner.getByLabel("เรื่องของน้อง *").fill("ลูกหมาร่าเริง เป็นมิตรกับคน ทดสอบขั้นตอนรับเลี้ยงแบบส่งมอบจริง");
  await owner.getByRole("button", { name: "บันทึกโพสต์" }).click();
  await owner.waitForURL(/\/pets\/\d+$/);
  petId = Number(owner.url().split("/").pop());
  await owner.getByRole("link", { name: "แก้ไขโพสต์" }).click();
  await owner.getByLabel("เรื่องของน้อง *").fill("ลูกหมาร่าเริง เป็นมิตรกับคน ฉีดวัคซีนเข็มแรกแล้ว (แก้ไขแล้ว)");
  await owner.getByRole("button", { name: "บันทึกโพสต์" }).click();
  await owner.getByText("(แก้ไขแล้ว)").first().waitFor();
});

await step("applicant: search, favorite, and send an adoption request", async () => {
  await login(applicant, APPLICANT, "/pets");
  await applicant.getByLabel("ค้นหาน้อง").fill(PET);
  await applicant.getByText(PET, { exact: false }).first().waitFor(); // ผลค้นหามีน้องตัวนี้
  await applicant.goto(`${base}/pets/${petId}`);
  await applicant.getByRole("button", { name: `เพิ่ม${PET}ในรายการโปรด` }).click();
  await applicant.getByRole("button", { name: `เอา${PET}ออกจากรายการโปรด` }).waitFor();
  await applicant.getByLabel("เบอร์โทรติดต่อ *").fill("0000099999");
  await applicant.getByLabel("แนะนำตัวสั้น ๆ *").fill("มีบ้านเดี่ยวพร้อมสนาม ทำงานที่บ้าน ดูแลน้องได้ทั้งวัน (ทดสอบ)");
  await applicant.getByRole("checkbox").check();
  await applicant.getByRole("button", { name: "ส่งคำขอรับเลี้ยง" }).click();
  await applicant.getByText("รอผู้โพสต์พิจารณา").first().waitFor();
});

await step("owner: in-app notification for the new request → opens the pet", async () => {
  await owner.goto(`${base}/me?tab=notifications`);
  await owner.getByRole("link", { name: /มีคำขอรับเลี้ยงใหม่.*น้องทดสอบ E2E/ }).first().click();
  await owner.waitForURL(new RegExp(`/pets/${petId}$`));
});

await step("owner: accept (≠ adopted) and start arranging the handover", async () => {
  await owner.getByRole("button", { name: "ตอบรับ", exact: true }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "ตอบรับ" }).click();
  await owner.getByText("ผู้โพสต์ตอบรับแล้ว").first().waitFor();
  assert.equal((await api(`/pets/${petId}`)).body.status, "PENDING", "accepting must not mark the pet adopted");
  await owner.getByRole("button", { name: "เริ่มนัดส่งมอบ" }).click();
  await owner.getByText("กำลังนัดส่งมอบ").first().waitFor();
});

await step("owner reports the handover today", async () => {
  await owner.getByLabel("วันที่ส่งมอบ *").fill(today);
  await owner.getByRole("button", { name: "บันทึกรายงาน" }).click();
  await owner.getByText("แจ้งส่งมอบแล้ว รอยืนยัน").first().waitFor();
});

await step("applicant reports a different date → dispute shown to both", async () => {
  await applicant.reload();
  await applicant.getByText("แจ้งส่งมอบแล้ว รอยืนยัน").first().waitFor();
  await applicant.getByLabel("วันที่ส่งมอบ *").fill(yesterday);
  await applicant.getByRole("button", { name: "บันทึกรายงาน" }).click();
  await applicant.getByText(/ข้อมูลการส่งมอบไม่ตรงกัน/).first().waitFor();
  assert.equal((await api(`/pets/${petId}`)).body.status, "PENDING", "one-sided / conflicting reports never adopt");
});

await step("applicant corrects the report and confirms; owner confirms (still needs admin because disputed)", async () => {
  await applicant.getByRole("button", { name: "แก้ไขรายงานของคุณ" }).click();
  await applicant.getByLabel("วันที่ส่งมอบ *").fill(today);
  await applicant.getByRole("button", { name: "บันทึกรายงาน" }).click();
  await applicant.getByRole("button", { name: "ยืนยันรายละเอียดการส่งมอบ" }).click();
  await applicant.getByRole("dialog").getByRole("button", { name: "ยืนยัน" }).click();
  await applicant.getByText(/คุณยืนยันแล้ว/).waitFor();
  await owner.reload();
  await owner.getByRole("button", { name: "ยืนยันรายละเอียดการส่งมอบ" }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "ยืนยัน" }).click();
  await owner.getByText(/คุณยืนยันแล้ว/).waitFor();
  assert.equal((await api(`/pets/${petId}`)).body.status, "PENDING", "disputed case waits for admin review");
});

const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const admin = await adminCtx.newPage();
watch(admin);
await step("admin reviews the dispute with a reason → COMPLETED, pet adopted", async () => {
  const token = await tokenOf(ADMIN);
  const cases = (await api(`/admin/adoptions?q=${encodeURIComponent(PET)}`, { token })).body.items;
  assert.equal(cases.length, 1);
  await login(admin, ADMIN, `/admin/adoptions/AD-${cases[0].id}`);
  await admin.getByRole("button", { name: "ยืนยันผลตรวจสอบการส่งมอบ" }).click();
  await admin.getByRole("dialog").getByLabel("ผลตรวจสอบและหลักฐาน").fill("โทรยืนยันทั้งสองฝ่าย ส่งมอบวันนี้จริง (E2E)");
  await admin.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "ยืนยันผลตรวจ" }).click();
  await admin.getByText("ยืนยันผลตรวจสอบแล้ว").first().waitFor();
  assert.equal((await api(`/pets/${petId}`)).body.status, "ADOPTED");
});

await step("applicant sees completion in the panel and notifications; timeline is readable", async () => {
  await applicant.reload();
  await applicant.getByText(/รับเลี้ยงสำเร็จ ขอบคุณ/).waitFor();
  await applicant.getByRole("button", { name: "ดูประวัติการดำเนินการ" }).click();
  await applicant.getByText("ผู้ดูแลยืนยันผลตรวจสอบ · รับเลี้ยงสำเร็จ").waitFor();
  await applicant.goto(`${base}/me?tab=notifications`);
  await applicant.getByText("รับเลี้ยงสำเร็จ", { exact: true }).first().waitFor();
  await applicant.getByRole("button", { name: "อ่านทั้งหมดแล้ว" }).click();
  await applicant.getByText("ยังไม่อ่าน 0 รายการ").waitFor();
});

await step("admin publishes an announcement → it appears on the home page", async () => {
  await admin.goto(`${base}/admin/announcements`);
  await admin.getByRole("button", { name: "สร้างประกาศ" }).click();
  const dialog = admin.getByRole("dialog", { name: "สร้างประกาศ" });
  await dialog.getByLabel("ชื่อประกาศ").fill("ประกาศจาก E2E หน้าแรก");
  await dialog.getByLabel("รายละเอียด").fill("ทดสอบการแสดงบนหน้าแรก");
  await dialog.getByLabel("ปลายทางปุ่ม (path ในเว็บ)").fill("/pets");
  await dialog.getByLabel(/เผยแพร่ทันที/).check();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await admin.getByText("สร้างประกาศแล้ว").first().waitFor();
  const token = await tokenOf(ADMIN);
  const created = (await api("/admin/announcements", { token })).body.find((a) => a.title === "ประกาศจาก E2E หน้าแรก");
  await api(`/admin/announcements/${created.id}`, { token, method: "PATCH", body: { displayOrder: 0 } });
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: /ประกาศจาก E2E หน้าแรก/ }).waitFor();
  await page.close();
});

await step("admin dashboard + reports read the seeded dataset", async () => {
  await admin.goto(`${base}/admin`);
  await admin.getByRole("heading", { level: 1, name: "ภาพรวม" }).waitFor();
  await admin.goto(`${base}/admin/reports`);
  await admin.getByRole("heading", { level: 1, name: "รายงาน" }).waitFor();
  const token = await tokenOf(ADMIN);
  const report = (await api("/admin/reports?from=2020-01-01", { token })).body;
  assert.ok(report.requests.created >= 180, `report counts the dataset (${report.requests.created})`);
});

await step("mobile 390px: pet page with handover panel and notifications fit the screen", async () => {
  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await mobile.newPage();
  watch(page);
  await login(page, OWNER, `/pets/${petId}`);
  await page.getByText(/รับเลี้ยงสำเร็จ/).first().waitFor();
  await noOverflow(page);
  await page.goto(`${base}/me?tab=notifications`);
  await page.getByRole("status").filter({ hasText: "ยังไม่อ่าน" }).waitFor();
  await noOverflow(page);
  await page.goto(`${base}/admin/adoptions`);
  await page.getByRole("heading", { level: 1, name: "คำขอรับเลี้ยง" }).waitFor({ timeout: 5000 }).then(
    () => assert.fail("a regular user must not see the admin list"),
    () => {},
  );
  await mobile.close();
});

await step("no unexpected console/page errors", async () => assert.deepEqual(errors, []));

await browser.close();
console.log(results.join("\n"));
const failed = results.filter((r) => !r.startsWith("PASS")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
