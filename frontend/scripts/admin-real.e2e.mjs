// Browser E2E ของ Real Admin Mode: Chromium → Vite → Express จริง → PostgreSQL จำลอง (PGlite)
// Supabase Auth/Storage เป็นของปลอมใน backend/tests/e2e/server.ts — ไม่แตะ Supabase หรือข้อมูลจริงเลย
//   1) cd backend && npx tsx --import ./tests/e2e/loader.mjs tests/e2e/server.ts
//   2) cd frontend && VITE_API_URL=http://localhost:3101/api npx vite --port 5182
//   3) PAWHOME_PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/admin-real.e2e.mjs
// ต้องเริ่ม server ข้อ 1 ใหม่ทุกครั้ง (สคริปต์เปลี่ยนข้อมูลในฐานข้อมูลจำลอง)
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PAWHOME_PLAYWRIGHT ?? "playwright");
const base = process.env.PAWHOME_URL ?? "http://localhost:5182";
const apiBase = process.env.PAWHOME_API ?? "http://localhost:3101/api";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); } catch (error) { results.push(`FAIL  ${name}\n      ${String(error.message).split("\n")[0]}`); }
}

// เรียก Backend ตรงเพื่อเตรียม/ตรวจผล (ไม่ผ่านหน้าเว็บ)
async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const tokenOf = async (email) => (await api("/auth/login", { method: "POST", body: { email, password: "123456" } })).body.token;

const h1 = (page, name) => page.getByRole("heading", { level: 1, name, exact: true }).waitFor({ timeout: 15000 });
async function login(page, email, redirect = "/admin") {
  await page.goto(`${base}/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("123456");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
}

const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  // 401/403 ที่ตั้งใจทดสอบ และ request ที่สคริปต์ตั้งใจตัดเน็ต ไม่นับเป็น error
  page.on("console", (m) => m.type() === "error" && !/status of 40[13]|ERR_FAILED|Failed to fetch/.test(m.text()) && errors.push(m.text().slice(0, 200)));
};

// เตรียมข้อมูล: เจ้าของ (shelter) อนุมัติคำขอ #1 ในโหมดเดิม → legacy review รอผู้ดูแลตัดสิน
const shelterToken = await tokenOf("shelter@pawhome.test");
const approved = await api("/adoptions/1", { token: shelterToken, method: "PATCH", body: { status: "APPROVED" } });
const adminToken = await tokenOf("e2e-admin@pawhome.test");

await step("setup: legacy approval is ACCEPTED + review (not COMPLETED)", async () => {
  assert.equal(approved.status, 200);
  assert.equal(approved.body.stage, "ACCEPTED");
  const detail = await api("/admin/adoptions/1", { token: adminToken });
  assert.equal(detail.body.legacyReview, true);
});

const anon = await browser.newContext();
const anonPage = await anon.newPage();
watch(anonPage);
await step("anonymous → login gate, no admin layout or data rendered", async () => {
  await anonPage.goto(`${base}/admin/pets`);
  await h1(anonPage, "เข้าสู่ระบบผู้ดูแล");
  assert.equal(await anonPage.locator(".ad-sidebar").count(), 0);
  assert.equal(await anonPage.getByText("ข้าวตัง").count(), 0);
});

await step("regular USER logs in → forbidden screen (role checked by Backend)", async () => {
  await login(anonPage, "mind@pawhome.test");
  await h1(anonPage, "ไม่มีสิทธิ์เข้าถึง");
  assert.equal(await anonPage.locator(".ad-sidebar").count(), 0);
});
await anon.close();

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
watch(page);

await step("ADMIN logs in → dashboard with real data, no mock data, Real banner", async () => {
  await login(page, "e2e-admin@pawhome.test");
  await h1(page, "ภาพรวม");
  await page.getByText("ข้อมูลจริง", { exact: true }).waitFor();
  assert.equal(await page.getByText("โหมดตัวอย่าง").count(), 0);
  const body = await page.locator("body").innerText();
  assert.ok(!/ต้นกล้า|ฟ้าใส|บ้านพักน้องจร \(ข้อมูลจำลอง\)/.test(body), "mock seed names must not appear");
  // รายการเคสใน Real Mode เป็นรหัสจริง AD-<id>
  await page.goto(`${base}/admin/adoptions`);
  await h1(page, "คำขอรับเลี้ยง");
  await page.getByRole("link", { name: /^เปิดเคส AD-1 / }).waitFor();
});

await step("legacy case: admin confirms handover with a reason → COMPLETED in the database", async () => {
  await page.goto(`${base}/admin/adoptions/AD-1`);
  await page.getByRole("button", { name: "ยืนยันว่าส่งมอบแล้ว" }).click();
  await page.getByRole("dialog").getByLabel("ผลตรวจสอบและหลักฐาน").fill("โทรยืนยันทั้งสองฝ่ายแล้ว (E2E)");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
  await page.getByText("ยืนยันการส่งมอบแล้ว").first().waitFor();
  const detail = await api("/admin/adoptions/1", { token: adminToken });
  assert.equal(detail.body.stage, "COMPLETED");
  assert.equal(detail.body.resolution, "โทรยืนยันทั้งสองฝ่ายแล้ว (E2E)");
  await page.getByRole("link", { name: "ไทม์ไลน์" }).click();
  await page.getByText("ผู้ดูแลยืนยันผลตรวจสอบ · รับเลี้ยงสำเร็จ").waitFor();
});

await step("follow-up: note is saved on the server and shown in notes", async () => {
  await page.goto(`${base}/admin/adoptions/AD-2`);
  const before = (await api("/admin/adoptions/2", { token: adminToken })).body.lastActivityAt;
  await page.getByRole("button", { name: "เพิ่มบันทึกติดตาม" }).click();
  await page.getByRole("dialog").getByLabel("รายละเอียด").fill("โทรติดตามแล้ว (E2E)");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
  await page.getByRole("link", { name: "บันทึกติดตาม" }).click();
  await page.getByText("“โทรติดตามแล้ว (E2E)”").waitFor();
  assert.equal((await api("/admin/adoptions/2", { token: adminToken })).body.lastActivityAt, before, "a note must not reset the owner's clock");
});

await step("pets: hide a post → gone from the public API", async () => {
  await page.goto(`${base}/admin/pets`);
  await page.getByLabel("ค้นหาโพสต์").fill("ข้าวตัง");
  await page.getByRole("button", { name: "ดูโพสต์ ข้าวตัง" }).click();
  await page.getByRole("button", { name: "ซ่อนโพสต์" }).click();
  await page.getByRole("dialog", { name: /ซ่อนโพสต์/ }).getByRole("button", { name: "ซ่อนโพสต์" }).click();
  await page.getByText("ซ่อนโพสต์แล้ว").first().waitFor();
  const publicPets = (await api("/pets")).body;
  assert.ok(!publicPets.some((p) => p.name === "ข้าวตัง"));
  assert.equal(await page.getByRole("button", { name: "ลบโพสต์" }).count(), 0, "Real Mode has no delete");
});

await step("users: read-only overview (posts + requests, no suspension)", async () => {
  await page.keyboard.press("Escape");
  await page.goto(`${base}/admin/users`);
  await page.getByLabel("ค้นหาผู้ใช้").fill("ปอง");
  await page.getByRole("button", { name: "ดูบัญชี ปอง" }).click();
  await page.getByRole("heading", { name: /^โพสต์ \(/ }).waitFor();
  await page.getByRole("heading", { name: /^ประวัติคำขอรับเลี้ยง/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: "ระงับบัญชี" }).count(), 0);
  const pong = await tokenOf("pong@pawhome.test");
  assert.equal((await api("/me/pets", { token: pong })).status, 200);
});

await step("announcements: create + publish → visible on the public API", async () => {
  await page.keyboard.press("Escape");
  await page.goto(`${base}/admin/announcements`);
  await page.getByRole("button", { name: "สร้างประกาศ" }).click();
  const dialog = page.getByRole("dialog", { name: "สร้างประกาศ" });
  await dialog.getByLabel("ชื่อประกาศ").fill("ประกาศ E2E");
  await dialog.getByLabel("รายละเอียด").fill("ทดสอบการเผยแพร่จากหน้าผู้ดูแล");
  await dialog.getByLabel("ปลายทางปุ่ม (path ในเว็บ)").fill("/pets");
  await dialog.getByLabel(/เผยแพร่ทันที/).check();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await page.getByText("สร้างประกาศแล้ว").first().waitFor();
  const published = (await api("/announcements")).body;
  assert.ok(published.some((a) => a.title === "ประกาศ E2E" && a.destination === "/pets"));
});

await step("admin menu has only the five pages (no reports / settings / audit)", async () => {
  await page.goto(`${base}/admin`);
  await h1(page, "ภาพรวม");
  const nav = page.locator(".ad-sidebar");
  for (const label of ["ภาพรวม", "จัดการสัตว์เลี้ยง", "คำขอรับเลี้ยง", "ผู้ใช้งาน", "ประชาสัมพันธ์"]) await nav.getByRole("link", { name: label }).waitFor();
  assert.equal(await nav.getByRole("link", { name: /รายงาน|ตั้งค่า/ }).count(), 0);
  assert.equal(await page.getByText("กิจกรรมผู้ใช้ล่าสุด").count(), 0);
  await page.goto(`${base}/admin/reports`);
  await page.getByText("ไม่พบหน้าผู้ดูแลนี้").waitFor();
  await page.goto(`${base}/admin`);
  await h1(page, "ภาพรวม");
});

await step("expired/invalid access token → refreshed automatically, admin stays signed in", async () => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("pawhome-auth"));
    raw.state.token = "token-invalid";
    localStorage.setItem("pawhome-auth", JSON.stringify(raw));
  });
  await page.reload();
  await h1(page, "ภาพรวม");
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("pawhome-auth")).state.token);
  assert.notEqual(token, "token-invalid");
});

await step("network error on /admin/me → error screen with retry", async () => {
  await page.route("**/api/admin/me", (route) => route.abort());
  await page.reload();
  await h1(page, "เชื่อมต่อระบบไม่สำเร็จ");
  assert.equal(await page.locator(".ad-sidebar").count(), 0);
  await page.unroute("**/api/admin/me");
  await page.getByRole("button", { name: "ลองใหม่" }).click();
  await h1(page, "ภาพรวม");
});

await step("logout in another tab → this tab locks immediately", async () => {
  const other = await context.newPage();
  await other.goto(`${base}/`);
  await other.evaluate(() => localStorage.setItem("pawhome-auth", JSON.stringify({ state: { user: null, token: null, refreshToken: null, expiresAt: null }, version: 0 })));
  await h1(page, "เข้าสู่ระบบผู้ดูแล");
  assert.equal(await page.locator(".ad-sidebar").count(), 0);
  await other.close();
});

await step("no unexpected console/page errors", async () => assert.deepEqual(errors, []));

await browser.close();
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
