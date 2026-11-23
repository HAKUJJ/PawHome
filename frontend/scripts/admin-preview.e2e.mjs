// Browser E2E ของ Admin Preview + หน้า Pet Detail (Chromium ผ่าน Playwright)
// ไม่เพิ่ม dependency ให้โปรเจกต์: ชี้ Playwright ที่ติดตั้งไว้ที่อื่นด้วย PAWHOME_PLAYWRIGHT
//   VITE_ADMIN_PREVIEW=true npx vite --port 5181
//   PAWHOME_PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs PAWHOME_URL=http://localhost:5181 PAWHOME_SHOTS=./shots node scripts/admin-preview.e2e.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium, devices } = await import(process.env.PAWHOME_PLAYWRIGHT ?? "playwright");
const base = process.env.PAWHOME_URL ?? "http://localhost:5181";
const shots = process.env.PAWHOME_SHOTS;
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); } catch (error) { results.push(`FAIL  ${name}\n      ${String(error.message).split("\n")[0]}`); }
}
async function shot(page, name, fullPage = true) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready.then(() => null));
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
}
const h1 = (page, name) => page.getByRole("heading", { level: 1, name, exact: true }).waitFor({ timeout: 10000 });
const noOverflow = async (page) => {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(extra <= 0, `${page.url()} overflowed by ${extra}px at ${page.viewportSize().width}px`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const network = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text().slice(0, 200)));
page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
page.on("request", (request) => {
  if (["fetch", "xhr"].includes(request.resourceType()) && !request.url().startsWith(base)) network.push(request.url());
});

const routes = [["", "ภาพรวม"], ["pets", "จัดการสัตว์เลี้ยง"], ["adoptions", "คำขอรับเลี้ยง"], ["adoptions/AD-104", "ข้าวปั้น"],
  ["workflow-preview", "จำลองขั้นตอนรับเลี้ยง"], ["users", "ผู้ใช้งาน"], ["announcements", "ประชาสัมพันธ์"],
  ["reports", "รายงาน"], ["audit-logs", "ประวัติกิจกรรม"], ["settings", "ตั้งค่า"]];

await step("all 10 admin routes × 6 widths render without page-level horizontal overflow", async () => {
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of routes) {
      await page.goto(`${base}/admin${path ? `/${path}` : ""}`);
      await h1(page, title);
      await noOverflow(page);
    }
  }
});

await page.setViewportSize({ width: 1440, height: 1000 });
await step("dashboard: action queue first, KPIs link to matching list", async () => {
  await page.goto(`${base}/admin`);
  await h1(page, "ภาพรวม");
  await page.waitForLoadState("networkidle");
  await shot(page, "01-dashboard-desktop");
  const firstCard = page.locator("main section").first();
  await firstCard.getByRole("heading", { name: "เคสรับเลี้ยงที่ต้องติดตาม" }).waitFor();
  const overdueKpi = Number(await page.getByRole("link", { name: /เกินเวลาตาม Policy/ }).locator("strong").innerText());
  await page.getByRole("link", { name: /เกินเวลาตาม Policy/ }).click();
  await page.getByRole("heading", { name: `รายการคำขอ · ${overdueKpi} เคส` }).waitFor();
});

await step("case detail: 5 steps, tabs, contact attempt keeps 24/48/72 status, Back/Forward", async () => {
  await page.goto(`${base}/admin`);
  await page.getByRole("link", { name: /เปิดเคส AD-104/ }).click();
  await h1(page, "ข้าวปั้น");
  assert.equal(await page.getByRole("list", { name: "ความคืบหน้าของเคส" }).getByRole("listitem").count(), 5);
  await page.getByRole("navigation", { name: "รายละเอียดเคส" }).getByRole("link", { name: "ตัวอย่างแจ้งเตือน" }).click();
  await page.getByRole("heading", { name: /24 \/ 48 \/ 72/ }).waitFor();
  assert.equal(await page.getByText("ถึงเกณฑ์", { exact: true }).count(), 3);
  await shot(page, "02-case-notifications");
  await page.getByRole("button", { name: "บันทึกการติดต่อ" }).click();
  await page.getByRole("dialog").getByLabel("รายละเอียด").fill("โทรติดตามแล้ว");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
  assert.equal(await page.getByText("ถึงเกณฑ์", { exact: true }).count(), 3, "contact attempt must not reset the owner's clock");
  await page.getByRole("link", { name: "บันทึกติดตาม" }).click();
  await page.getByText("“โทรติดตามแล้ว”").waitFor();
  await page.goBack();
  await page.getByRole("heading", { name: /24 \/ 48 \/ 72/ }).waitFor();
  await page.goForward();
  await page.getByRole("heading", { name: "บันทึกติดตามของผู้ดูแล" }).waitFor();
});

await step("confirm dialog: focus stays inside, Escape cancels and restores focus", async () => {
  await page.goto(`${base}/admin/workflow-preview`);
  const reset = page.getByRole("button", { name: "เริ่มสถานการณ์ใหม่" });
  await reset.click();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")) || document.activeElement === document.body));
  }
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.ok(await reset.evaluate((element) => element === document.activeElement));
});

await step("workflow preview: accept ≠ adopted, mismatch → dispute, both confirm + admin verify → completed", async () => {
  await page.goto(`${base}/admin/workflow-preview`);
  const perspectives = page.getByRole("group", { name: "มุมมองในตัวจำลอง" });
  await perspectives.getByRole("button", { name: /ผู้ขอรับเลี้ยง/ }).click();
  await page.getByRole("button", { name: "ส่งคำขอรับเลี้ยง" }).click();
  await perspectives.getByRole("button", { name: /เจ้าของ/ }).click();
  await page.getByRole("button", { name: "ตอบรับคำขอ" }).click();
  await page.getByText("เจ้าของตอบรับแล้ว").first().waitFor();
  assert.equal(await page.getByText("รับเลี้ยงสำเร็จ", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "เริ่มนัดส่งมอบ" }).click();
  const report = async (button, date) => {
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("dialog").getByLabel("วันที่ส่งมอบ").fill(date);
    await page.getByRole("dialog").getByRole("button", { name: "บันทึกรายงาน" }).click();
  };
  await report("รายงานการส่งมอบ", "2026-11-23");
  assert.equal(await page.getByText("รับเลี้ยงสำเร็จ", { exact: true }).count(), 0, "one-sided report must not complete");
  await perspectives.getByRole("button", { name: /ผู้ขอรับเลี้ยง/ }).click();
  await report("รายงานการรับสัตว์", "2026-11-24");
  await page.getByText("ต้องตรวจสอบ · รายงานสองฝ่ายไม่ตรงกัน").waitFor();
  await report("แก้ไขรายงานส่งมอบ", "2026-11-23");
  await page.getByRole("button", { name: "ยืนยันรายละเอียดการรับสัตว์" }).click();
  await perspectives.getByRole("button", { name: /เจ้าของ/ }).click();
  await page.getByRole("button", { name: "ยืนยันการส่งมอบ" }).click();
  assert.equal(await page.getByText("รับเลี้ยงสำเร็จ", { exact: true }).count(), 0, "disputed case needs admin verification");
  await perspectives.getByRole("button", { name: "ผู้เข้าชมทั่วไป" }).click();
  assert.equal(await page.getByText(/08x-xxx-xxxx|สนใจรับน้อง|มีพื้นที่ในบ้าน/).count(), 0, "public view must not show contact or private message");
  await perspectives.getByRole("button", { name: /เจ้าของ/ }).click();
  await shot(page, "03-workflow-preview");
  await page.getByRole("link", { name: "เปิดเคสในหน้าผู้ดูแล" }).click();
  await page.getByRole("button", { name: "ยืนยันผลตรวจสอบการส่งมอบ" }).click();
  await page.getByRole("dialog").getByLabel("ผลตรวจสอบและหลักฐาน").fill("โทรยืนยันทั้งสองฝ่ายแล้ว");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ยืนยันผลตรวจ" }).click();
  await page.getByText("รับเลี้ยงสำเร็จ", { exact: true }).first().waitFor();
});

await step("pets: filter, approve, send back with reason, delete with confirm, pagination", async () => {
  await page.goto(`${base}/admin/pets?status=review`);
  await h1(page, "จัดการสัตว์เลี้ยง");
  await page.getByText("พบ 4 โพสต์").waitFor();
  // ผลการตรวจ: ส่งกลับไปแก้ไขต้องมีเหตุผล · ไม่มีปุ่มไม่อนุมัติและแก้ไขโพสต์
  await page.getByRole("button", { name: "ดูโพสต์ ภูผา" }).click();
  const drawer = page.getByRole("dialog");
  assert.equal(await drawer.getByRole("button", { name: /ไม่อนุมัติ|แก้ไขโพสต์/ }).count(), 0);
  await drawer.getByRole("button", { name: "↩ ส่งกลับไปแก้ไข" }).click();
  const reason = page.getByRole("dialog", { name: /ส่งกลับไปแก้ไข ·/ });
  assert.ok(await reason.getByRole("button", { name: "ส่งกลับไปแก้ไข" }).isDisabled(), "reason is required");
  await reason.getByRole("button", { name: /รูปไม่ชัด/ }).click();
  await reason.getByRole("button", { name: "ส่งกลับไปแก้ไข" }).click();
  await page.getByRole("dialog").getByText("สิ่งที่ขอให้แก้ไข").waitFor();
  await shot(page, "07-pet-review-drawer", false);
  await page.getByRole("dialog").getByRole("button", { name: "✓ อนุมัติ" }).click();
  await page.keyboard.press("Escape");
  await page.getByText("พบ 3 โพสต์").waitFor();
  await page.goto(`${base}/admin/pets`);
  await page.getByLabel("ค้นหาโพสต์").fill("ทองหยิบ");
  await page.getByRole("button", { name: "ดูโพสต์ ทองหยิบ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ลบโพสต์" }).click();
  await page.getByRole("dialog", { name: /ลบโพสต์/ }).getByRole("button", { name: "ลบโพสต์" }).click();
  await page.getByLabel("ค้นหาโพสต์").fill("ทองหยิบ");
  await page.getByText("ไม่พบโพสต์ที่ตรงกับตัวกรอง").waitFor();
  await page.goto(`${base}/admin/pets`);
  await page.getByRole("button", { name: "ถัดไป" }).click(); // pagination
  await page.getByText(/หน้า 2\//).waitFor();
});

await step("users, announcements, reports CSV, audit log", async () => {
  await page.goto(`${base}/admin/users`);
  await page.getByRole("button", { name: "ดูบัญชี มะลิ" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ระงับบัญชี" }).click();
  await page.getByRole("dialog", { name: /ระงับบัญชี/ }).getByRole("button", { name: "ระงับบัญชี" }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("สถานะบัญชี").selectOption("suspended");
  await page.getByRole("button", { name: "ดูบัญชี มะลิ" }).waitFor();

  await page.goto(`${base}/admin/announcements`);
  await page.getByRole("button", { name: "สร้างประกาศ" }).click();
  await page.getByRole("dialog").getByLabel("ชื่อประกาศ").fill("ประกาศทดสอบ");
  await page.getByRole("dialog").getByLabel("รายละเอียด").fill("รายละเอียดจำลอง");
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await page.getByRole("heading", { name: "ประกาศทดสอบ" }).waitFor();

  await page.goto(`${base}/admin/reports`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ดาวน์โหลด CSV" }).click();
  assert.equal((await download).suggestedFilename(), "pawhome-preview-report.csv");

  await page.goto(`${base}/admin/audit-logs`);
  await page.getByLabel("ค้นหากิจกรรม").fill("ประกาศทดสอบ");
  // full page reload resets the mock store, so search a seeded entry instead
  await page.getByLabel("ค้นหากิจกรรม").fill("ระงับบัญชี");
  await page.getByRole("button", { name: /ดูกิจกรรม ระงับบัญชี/ }).first().click();
  await page.getByRole("dialog").getByText("ผู้ใช้").first().waitFor();
});

await step("mobile 390px: drawer navigation, dashboard, case detail", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/admin`);
  await h1(page, "ภาพรวม");
  await page.waitForLoadState("networkidle");
  await shot(page, "04-dashboard-mobile");
  await page.getByRole("button", { name: "เปิดเมนูผู้ดูแล" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "คำขอรับเลี้ยง" }).click();
  await h1(page, "คำขอรับเลี้ยง");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.goto(`${base}/admin/adoptions/AD-103`);
  await h1(page, "งาดำ");
  await noOverflow(page);
  await shot(page, "05-case-mobile");
});

await step("public pet detail: province pill, info cards, no overflow at 390px", async () => {
  await page.goto(`${base}/pets/1`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.getByText(/^จังหวัด/).waitFor({ state: "attached" });
  await page.getByText("สถานะการรับเลี้ยง").waitFor();
  await noOverflow(page);
  await shot(page, "06-pet-detail-mobile");
});

await step("admin preview made zero fetch/XHR calls to other hosts", async () => assert.deepEqual(network, []));
await step("no console errors", async () => assert.deepEqual(errors, []));

const mobile = await browser.newPage({ ...devices["iPhone 13"] });
await step("iPhone 13 emulation: dashboard fits", async () => {
  await mobile.goto(`${base}/admin`);
  await h1(mobile, "ภาพรวม");
  await noOverflow(mobile);
});
await browser.close();

console.log(results.join("\n"));
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
