// Browser E2E: คลิกสาธิตด้วยชุดข้อมูลเล็ก (database/seeds/minimal) บนโหมดสาธิตในเครื่อง
//   1) cd backend && E2E_ORIGIN=http://localhost:5182 npm run dev:demo        (Express จริง + PGlite · พอร์ต 3000)
//   2) cd frontend && VITE_API_URL=http://localhost:3000/api npx vite --port 5182
//   3) PAWHOME_PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/minimal-demo.e2e.mjs
// เริ่ม server ข้อ 1 ใหม่ทุกครั้ง (สคริปต์เปลี่ยนข้อมูล)
import assert from "node:assert/strict";

const { chromium, devices } = await import(process.env.PAWHOME_PLAYWRIGHT ?? "playwright");
const base = process.env.PAWHOME_URL ?? "http://localhost:5182";
const apiBase = process.env.PAWHOME_API ?? "http://localhost:3000/api";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); } catch (error) { results.push(`FAIL  ${name}\n      ${String(error.message).split("\n")[0]}`); }
}
const get = async (path) => (await fetch(`${apiBase}${path}`)).json();
async function login(page, email, redirect) {
  await page.goto(`${base}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("123456");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
}
const errors = [];
const browser = await chromium.launch();
const open = async (options = { viewport: { width: 1280, height: 900 } }) => {
  const page = await (await browser.newContext(options)).newPage();
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && !/status of 40[0-9]|ERR_FAILED|Failed to fetch/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  return page;
};

await step("dataset: 10 pets with the expected statuses (no legacy mock data)", async () => {
  const pets = await get("/pets");
  assert.equal(pets.length, 10);
  const status = Object.fromEntries(pets.map((p) => [p.name, p.status]));
  assert.deepEqual(status, { ส้มโอ: "AVAILABLE", ข้าวตัง: "PENDING", โมจิ: "PENDING", บราวนี่: "PENDING", ปุยฝ้าย: "PENDING", ลัคกี้: "ADOPTED", เจ้าด่าง: "PENDING", น้ำตาล: "PENDING", ถุงทอง: "AVAILABLE", มะลิ: "AVAILABLE" });
});

await step("applicant นิว: confirms the matched handover of ปุยฝ้าย → adoption completed", async () => {
  const page = await open();
  await login(page, "mini-06.applicant@pawhome.test", "/pets/2205");
  await page.getByText("แจ้งส่งมอบแล้ว รอยืนยัน").first().waitFor();
  await page.getByRole("button", { name: "ยืนยันรายละเอียดการส่งมอบ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ยืนยัน" }).click();
  await page.getByText(/รับเลี้ยงสำเร็จ ขอบคุณ/).waitFor();
  assert.equal((await get("/pets/2205")).status, "ADOPTED");
});

await step("owner บ้านพักสายใจ: sees unread notifications, accepts ข้าวตัง's request and starts arranging", async () => {
  const page = await open();
  await login(page, "mini-02.shelter@pawhome.test", "/me?tab=notifications");
  await page.getByRole("status").filter({ hasText: "ยังไม่อ่าน" }).waitFor();
  await page.getByRole("link", { name: /มีคำขอรับเลี้ยงใหม่.*ข้าวตัง/ }).click();
  await page.waitForURL(/\/pets\/2202$/);
  await page.getByRole("button", { name: "ตอบรับ", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ตอบรับ" }).click();
  await page.getByRole("button", { name: "เริ่มนัดส่งมอบ" }).click();
  await page.getByText("กำลังนัดส่งมอบ").first().waitFor();
  assert.equal((await get("/pets/2202")).status, "PENDING", "accepting is not adoption");
});

await step("applicant ภูมิ: requests list shows every stage of his 4 requests", async () => {
  const page = await open();
  await login(page, "mini-04.applicant@pawhome.test", "/me?tab=requests");
  for (const label of ["กำลังนัดส่งมอบ", "แจ้งส่งมอบแล้ว รอยืนยัน", "ยกเลิกแล้ว"]) await page.getByText(label, { exact: true }).first().waitFor();
  await page.getByText(/ข้อมูลการส่งมอบไม่ตรงกัน/).first().waitFor(); // น้ำตาล: ข้อพิพาท
});

await step("admin: follow-up queue shows the overdue (เจ้าด่าง) and disputed (น้ำตาล) cases with notes", async () => {
  const page = await open({ viewport: { width: 1440, height: 1000 } });
  await login(page, "mini-01.admin@pawhome.test", "/admin/adoptions/AD-3509");
  await page.getByRole("heading", { level: 1, name: "เจ้าด่าง" }).waitFor();
  await page.getByRole("link", { name: "บันทึกติดตาม" }).click();
  await page.getByText("“โทรหาเจ้าของแล้ว ไม่รับสาย จะโทรอีกครั้งพรุ่งนี้”").waitFor();
  await page.goto(`${base}/admin/adoptions/AD-3510?tab=handover`);
  await page.getByRole("heading", { level: 1, name: "น้ำตาล" }).waitFor();
  await page.getByText(/ต้องตรวจสอบ · รายงานสองฝ่ายไม่ตรงกัน/).first().waitFor();
});

await step("mobile: applicant pet page fits a 390px screen", async () => {
  const page = await open({ ...devices["iPhone 13"] });
  await login(page, "mini-05.applicant@pawhome.test", "/pets/2203");
  await page.getByText("ผู้โพสต์ตอบรับแล้ว").first().waitFor();
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(extra <= 0, `overflow ${extra}px`);
});

await step("no unexpected console/page errors", async () => assert.deepEqual(errors, []));

await browser.close();
console.log(results.join("\n"));
const failed = results.filter((r) => !r.startsWith("PASS")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
