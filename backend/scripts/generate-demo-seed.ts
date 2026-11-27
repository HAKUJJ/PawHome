// สร้าง database/seeds/*.sql จากชุดข้อมูลสมมติแบบ deterministic (seed คงที่ → รันกี่ครั้งได้ไฟล์เดิม)
//   npx tsx scripts/generate-demo-seed.ts
// กฎธุรกิจทั้งหมดจำลองตาม backend/src/services (ไม่ใช่ข้อมูลสุ่มที่ขัดกัน):
// - ผู้ขอไม่ใช่เจ้าของ · หนึ่งน้องมีคำขอที่ตอบรับได้ครั้งเดียว · ตอบรับ ≠ ได้บ้าน
// - COMPLETED เฉพาะเมื่อรายงานสองฝ่ายตรงกัน + ยืนยันครบ หรือผู้ดูแลยืนยันผลตรวจ
// - ไทม์ไลน์เรียงเวลาและจบที่ stage ปัจจุบัน · บันทึกผู้ดูแลไม่รีเซ็ตเวลาเงียบ
// - เวลาทั้งหมดอ้างจุดยึดเดียว (created_at ของน้อง id 2001) → ทุกไฟล์และทุกรอบตรงกัน
import { mkdirSync, writeFileSync } from "node:fs";
import { DATASET_ID, DATASET_VERSION, DEMO_DATASET_USERS, ID_RANGES, type DemoUser } from "./demo-dataset.js";

// ---------- สุ่มแบบกำหนดผลได้ ----------
let state = 20_261_127;
function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const chance = (p: number) => random() < p;

const H = 60;
const D = 24 * H;
const user = (key: string) => DEMO_DATASET_USERS.find((u) => u.key === key)!;
const byPersona = (persona: string) => DEMO_DATASET_USERS.filter((u) => u.persona === persona);
const superAdmin = user("u01");
const admins = [user("u02"), user("u03")];

// ---------- โครงข้อมูล ----------
type Stage = "PENDING" | "ACCEPTED" | "ARRANGING_HANDOVER" | "HANDOVER_REPORTED" | "COMPLETED" | "REJECTED" | "CANCELLED";
type ActorRole = "OWNER" | "APPLICANT" | "ADMIN" | "SYSTEM";
interface Pet {
  id: number; owner: DemoUser; name: string; species: "DOG" | "CAT"; breed: string; ageMonths: number; sex: "MALE" | "FEMALE";
  province: string; imageUrl: string; description: string; vaccinated: boolean; sterilized: boolean; urgent: boolean;
  status: "AVAILABLE" | "PENDING" | "ADOPTED"; visibility: "VISIBLE" | "HIDDEN" | "CHANGES_REQUESTED" | "REVIEW";
  moderationReason: string; moderatedBy: DemoUser | null; moderatedAgo: number | null; createdAgo: number;
}
interface Req {
  id: number; pet: Pet; applicant: DemoUser; phone: string; housing: "HOUSE" | "CONDO" | "DORM"; message: string;
  stage: Stage; createdAgo: number; lastActivityAgo: number; followUpRequired: boolean; escalated: boolean; disputed: boolean;
  legacyReview: boolean; handoverVersion: number; ownerConfirmedAgo: number | null; applicantConfirmedAgo: number | null;
  completedAgo: number | null; verifiedAgo: number | null; verifiedBy: DemoUser | null; resolution: string; closedAgo: number | null;
}
interface History { id: number; req: Req; from: Stage | null; to: Stage; role: ActorRole; actor: DemoUser | null; note: string; ago: number }
interface Report { id: number; req: Req; party: "OWNER" | "APPLICANT"; handoverDaysAgo: number; outcome: "HANDED_OVER" | "NOT_HANDED_OVER"; note: string; version: number; reporter: DemoUser; ago: number }
interface FollowUp { id: number; req: Req; kind: string; note: string; actor: DemoUser; ago: number }
interface Announcement {
  id: number; title: string; category: string; description: string; eventDaysAhead: number | null; eventTime: string; location: string;
  contact: string; cta: string; destination: string; status: "DRAFT" | "PUBLISHED"; order: number; isDemo: boolean;
  publishedAgo: number | null; publishInMinutes: number | null; expiredAgo: number | null; createdAgo: number; author: DemoUser;
}
interface Notification {
  id: number; recipient: DemoUser | null; kind: string; req: Req | null; announcement: Announcement | null;
  // เวลาเหตุการณ์ที่อ้าง: แถวไทม์ไลน์ / last_activity ของคำขอ (cron) / เวลาเผยแพร่ประกาศ
  ref: { history: History } | { activity: Req } | { announcement: Announcement }; readAgo: number | null;
}

const pets: Pet[] = [];
const requests: Req[] = [];
const history: History[] = [];
const reports: Report[] = [];
const followUps: FollowUp[] = [];
const notifications: Notification[] = [];
const announcements: Announcement[] = [];
const favorites: { user: DemoUser; pet: Pet; ago: number }[] = [];
const seq = { history: ID_RANGES.stageHistory[0], report: ID_RANGES.handoverReports[0], followUp: ID_RANGES.followUps[0], notification: ID_RANGES.notifications[0], request: ID_RANGES.adoptionRequests[0] };

// ---------- น้อง 100 ตัว ----------
const provinces = ["กรุงเทพมหานคร", "ปทุมธานี", "นนทบุรี", "สมุทรปราการ", "ชลบุรี", "เชียงใหม่", "ขอนแก่น", "นครราชสีมา", "ภูเก็ต", "สระบุรี", "กาญจนบุรี"];
const dogNames = ["ข้าวตัง", "โกโก้", "เจ้าด่าง", "ลัคกี้", "ถุงทอง", "ไข่เจียว", "บราวนี่", "ดำดี", "ถั่วแดง", "ทองแท้", "ขนมปัง", "ชาเย็น", "มะม่วง", "ข้าวเหนียว", "ลูกชิ้น", "โอวัลติน", "ปังปอนด์", "หมูแดง", "เฉาก๊วย", "ส้มตำ", "ภูผา", "ลาเต้", "บิสกิต", "มอคค่า", "เปปเปอร์", "ทองหยอด", "นาโช่", "ซาลาเปา"];
const catNames = ["ส้มโอ", "มะลิ", "โมจิ", "น้ำตาล", "ปุยฝ้าย", "ขาวมณี", "มะปราง", "ช็อกโก้", "ทองหยิบ", "ไข่ตุ๋น", "นมเย็น", "เมฆ", "วาซาบิ", "บัวลอย", "แพนเค้ก", "ข้าวปั้น", "สาคู", "ลำไย", "พุดดิ้ง", "ส้มจี๊ด", "มิ้นต์", "ไอติม", "ซูชิ", "ทับทิม"];
const dogBreeds = ["พันทาง", "พันทาง", "พันทาง", "ไทยหลังอาน", "ชิบะผสม", "บางแก้ว", "โกลเด้นผสม", "ชิวาวาผสม"];
const catBreeds = ["ไทย", "ไทย", "ไทย", "วิเชียรมาศ", "ขาวมณี", "สก็อตติชผสม", "เปอร์เซียผสม"];
// รูปจากแหล่งเดียวกับ database/mock-data.sql (dog.ceo / thecatapi เปิดสาธารณะ) + รูปในโปรเจกต์ + ไม่มีรูป + ลิงก์เสียโดยตั้งใจ (ทดสอบ fallback)
const dogImages = ["https://images.dog.ceo/breeds/mix/cheyenne2.jpg", "https://images.dog.ceo/breeds/mix/floki-the-chilean-mutt-6.jpg", "https://images.dog.ceo/breeds/mix/rilo.jpg", "https://images.dog.ceo/breeds/mix/xeshabelka_(21).jpg", "https://images.dog.ceo/breeds/mix/xeshabelka_(33).jpg", "https://images.dog.ceo/breeds/shiba/shiba-13.jpg"];
const catImages = ["https://cdn2.thecatapi.com/images/267.jpg", "https://cdn2.thecatapi.com/images/3rK7HGo7r.jpg", "https://cdn2.thecatapi.com/images/HDxfaNlLj.jpg", "https://cdn2.thecatapi.com/images/MTY3NjI5MQ.jpg", "https://cdn2.thecatapi.com/images/O-57OLhn7.jpg", "https://cdn2.thecatapi.com/images/edr.jpg", "/pawhome-cat.png"];
const BROKEN_IMAGE = "https://images.dog.ceo/breeds/pawhome-test/broken-image-for-fallback.jpg";
const traits = ["ขี้อ้อน ชอบให้ลูบหัว", "ร่าเริง ชอบวิ่งเล่นในสนาม", "นิ่ง ๆ ชอบนอนกลางแดด", "ฉลาด รู้คำสั่งพื้นฐาน นั่ง รอ", "เข้ากับเด็กและสัตว์ตัวอื่นได้ดี", "ขี้กลัวคนแปลกหน้าในช่วงแรก แต่ผูกพันเร็ว", "กินเก่ง ไม่เลือกอาหาร", "ช่างคุย ชอบเดินตามคน", "ใช้กระบะทราย/ขับถ่ายเป็นที่แล้ว", "ชอบของเล่นลูกบอล"];
const backgrounds = ["พบหลงอยู่หน้าตลาด", "เจ้าของเดิมย้ายไปต่างประเทศ", "ช่วยออกมาจากริมถนนช่วงหน้าฝน", "เกิดในบ้านพักพิง", "มีคนนำมาฝากหน้าคลินิก", "ถูกทิ้งไว้ในกล่องหน้าวัด"];
const needs = ["อยากได้บ้านที่มีคนอยู่บ้านเป็นประจำ", "เหมาะกับบ้านที่มีรั้วรอบ", "อยู่คอนโดได้ถ้ามีเวลาพาเดินเล่น", "ต้องการเจ้าของที่ใจเย็นช่วงปรับตัว", "ยินดีให้ผู้สนใจมาเยี่ยมดูนิสัยก่อน"];

// เจ้าของ: บ้านพักพิง 15 · กลุ่มช่วยเหลือ 10 · เจ้าของตอบไว 6 · เจ้าของไม่ตอบ 6 · ที่เหลือกระจายให้เจ้าของทั่วไป
const ownerPlan: DemoUser[] = [];
const fastOwner = user("u06");
const silentOwner = user("u07");
const shelter = user("u04");
const rescue = user("u05");
// ลำดับน้องสัมพันธ์กับสถานการณ์ (ดู scenarioOf): 0–11 สำเร็จ, 48–77 รอเจ้าของตอบ
for (let i = 0; i < 100; i++) {
  if (i <= 5) ownerPlan.push(fastOwner); // เจ้าของตอบไว → เคสสำเร็จ
  else if (i >= 48 && i <= 53) ownerPlan.push(silentOwner); // เจ้าของเงียบ → เกินเวลา
  else ownerPlan.push(null as unknown as DemoUser);
}
const regularOwners = byPersona("owner");
const fillOwners = [...Array(15).fill(shelter), ...Array(10).fill(rescue)];
let regular = 0;
for (let i = 0; i < 100; i++) {
  if (ownerPlan[i]) continue;
  ownerPlan[i] = fillOwners.length && i % 3 === 0 ? fillOwners.shift()! : regularOwners[regular++ % regularOwners.length];
}
while (fillOwners.length) {
  const i = ownerPlan.findIndex((o, index) => o.persona === "owner" && index > 5 && !(index >= 48 && index <= 53));
  ownerPlan[i] = fillOwners.shift()!;
}

const usedNames = new Set<string>();
for (let i = 0; i < 100; i++) {
  const species = i % 9 < 5 ? "DOG" : "CAT";
  const names = species === "DOG" ? dogNames : catNames;
  let name = pick(names);
  for (let n = 2; usedNames.has(`${ownerPlan[i].key}:${name}`); n++) name = `${pick(names)}${n > 3 ? ` ${n}` : ""}`;
  usedNames.add(`${ownerPlan[i].key}:${name}`);
  const ageBand = pick(["baby", "adult", "adult", "senior"] as const);
  const ageMonths = ageBand === "baby" ? int(2, 11) : ageBand === "adult" ? int(12, 84) : int(96, 168);
  const imageRoll = random();
  const imageUrl = imageRoll < 0.07 ? "" : imageRoll < 0.09 ? BROKEN_IMAGE : pick(species === "DOG" ? dogImages : catImages);
  const description = `${backgrounds[i % backgrounds.length]} ${pick(traits)} ${pick(traits)} ${needs[i % needs.length]} (ข้อมูลตัวอย่างสำหรับทดสอบ)`;
  pets.push({
    id: ID_RANGES.pets[0] + i, owner: ownerPlan[i], name, species, breed: pick(species === "DOG" ? dogBreeds : catBreeds), ageMonths,
    sex: chance(0.5) ? "MALE" : "FEMALE", province: provinces[(i * 7) % provinces.length], imageUrl, description,
    vaccinated: chance(0.7), sterilized: ageMonths > 8 && chance(0.55), urgent: chance(0.15), status: "AVAILABLE", visibility: "VISIBLE",
    moderationReason: "", moderatedBy: null, moderatedAgo: null, createdAgo: int(25, 90) * D + int(0, 23) * H,
  });
}
pets[0].createdAgo = 95 * D; // id 2001 = จุดยึดเวลา (เก่าสุด)

// ---------- ช่วยสร้างเหตุการณ์ ----------
const minutes = (ago: number) => Math.max(5, Math.round(ago));
const after = (ago: number, min: number, max: number) => minutes(ago - int(min, max));
const owner = (r: Req) => r.pet.owner;
let phone = 1;
const messages = ["บ้านมีสนามหญ้า มีคนอยู่บ้านตลอดทั้งวัน เคยเลี้ยงสุนัขมาก่อน", "อยู่คอนโดที่อนุญาตให้เลี้ยงสัตว์ ติดมุ้งลวดระเบียงแล้ว", "ครอบครัวมีเด็กโตที่รักสัตว์ พร้อมพาไปฉีดวัคซีนตามนัด", "ทำงานที่บ้าน มีเวลาดูแลและพาเดินเล่นเช้าเย็น", "เคยรับเลี้ยงแมวจรมาแล้วสองตัว อยากให้มีเพื่อนเพิ่ม", "พร้อมพาไปทำหมันและตรวจสุขภาพที่คลินิกใกล้บ้าน", "อยู่บ้านกับคุณพ่อคุณแม่ ทุกคนยินดีช่วยกันดูแล"];

function addHistory(req: Req, from: Stage | null, to: Stage, role: ActorRole, actor: DemoUser | null, note: string, ago: number, movesStage = true) {
  const row: History = { id: seq.history++, req, from, to, role, actor, note, ago: minutes(ago) };
  history.push(row);
  req.stage = to;
  if (movesStage) req.lastActivityAgo = row.ago; // เปลี่ยนขั้น = การดำเนินการสำคัญ
  return row;
}
function notify(recipient: DemoUser | null, kind: string, req: Req | null, ref: Notification["ref"], announcement: Announcement | null = null) {
  const at = "history" in ref ? ref.history.ago : "activity" in ref ? ref.activity.lastActivityAgo : ref.announcement.publishedAgo!;
  // อ่านแล้ว: เก่ากว่า 3 วัน (ส่วนใหญ่) · ใหม่กว่านั้นยังไม่อ่าน
  const readAgo = at > 3 * D && chance(0.85) ? minutes(at - int(30, 6 * H)) : null;
  notifications.push({ id: seq.notification++, recipient, kind, req, announcement, ref, readAgo });
}
function followUp(req: Req, kind: string, note: string, actor: DemoUser, ago: number) {
  const row = { id: seq.followUp++, req, kind, note, actor, ago: minutes(ago) };
  followUps.push(row);
  if (kind === "FLAG") req.followUpRequired = true;
  if (kind === "UNFLAG") req.followUpRequired = false;
  if (kind === "ESCALATE") { req.escalated = true; req.followUpRequired = true; }
  if (kind === "RESOLVE") { req.followUpRequired = false; req.escalated = false; }
  if (kind === "CLOSE") { req.closedAgo = row.ago; req.followUpRequired = false; req.escalated = false; }
  return row;
}
function createRequest(pet: Pet, applicant: DemoUser, createdAgo: number): Req {
  const req: Req = {
    id: seq.request++, pet, applicant, phone: `00000${String(phone++).padStart(5, "0")}`, housing: pick(["HOUSE", "CONDO", "DORM"] as const),
    message: `${pick(messages)} สนใจน้อง${pet.name}ค่ะ/ครับ (ข้อความตัวอย่าง)`, stage: "PENDING", createdAgo: minutes(createdAgo), lastActivityAgo: minutes(createdAgo),
    followUpRequired: false, escalated: false, disputed: false, legacyReview: false, handoverVersion: 0, ownerConfirmedAgo: null, applicantConfirmedAgo: null,
    completedAgo: null, verifiedAgo: null, verifiedBy: null, resolution: "", closedAgo: null,
  };
  requests.push(req);
  const h = addHistory(req, null, "PENDING", "APPLICANT", applicant, "ส่งคำขอรับเลี้ยง", req.createdAgo);
  notify(owner(req), "NEW_REQUEST", req, { history: h });
  return req;
}
function accept(req: Req, ago: number) {
  const h = addHistory(req, "PENDING", "ACCEPTED", "OWNER", owner(req), "เจ้าของตอบรับคำขอ", ago);
  notify(req.applicant, "REQUEST_ACCEPTED", req, { history: h });
}
function legacyApprove(req: Req, ago: number) {
  const h = addHistory(req, "PENDING", "ACCEPTED", "OWNER", owner(req), "เจ้าของอนุมัติ (ระบบเดิม) · รอผู้ดูแลยืนยันการส่งมอบ", ago);
  req.legacyReview = true;
  req.followUpRequired = true;
  notify(req.applicant, "REQUEST_ACCEPTED", req, { history: h });
}
function ownerReject(req: Req, ago: number) {
  const h = addHistory(req, "PENDING", "REJECTED", "OWNER", owner(req), "เจ้าของปฏิเสธคำขอ", ago);
  notify(req.applicant, "REQUEST_REJECTED", req, { history: h });
}
function systemRejectOthers(main: Req, note: string, ago: number) {
  for (const other of requests.filter((r) => r.pet === main.pet && r !== main && r.stage === "PENDING")) {
    const h = addHistory(other, "PENDING", "REJECTED", "SYSTEM", null, note, ago);
    notify(other.applicant, "REQUEST_REJECTED", other, { history: h });
  }
}
function arrange(req: Req, ago: number) {
  const h = addHistory(req, "ACCEPTED", "ARRANGING_HANDOVER", "OWNER", owner(req), "เริ่มนัดส่งมอบ", ago);
  notify(req.applicant, "HANDOVER_ARRANGED", req, { history: h });
}
function report(req: Req, party: "OWNER" | "APPLICANT", handoverDaysAgo: number, ago: number, outcome: Report["outcome"] = "HANDED_OVER", note = "") {
  const reporter = party === "OWNER" ? owner(req) : req.applicant;
  const h = addHistory(req, req.stage, "HANDOVER_REPORTED", party, reporter, "บันทึกรายงานส่งมอบ", ago);
  req.handoverVersion += 1;
  req.ownerConfirmedAgo = null; // รายงานใหม่ล้างการยืนยันเดิม
  req.applicantConfirmedAgo = null;
  reports.push({ id: seq.report++, req, party, handoverDaysAgo, outcome, note, version: req.handoverVersion, reporter, ago: h.ago });
  notify(party === "OWNER" ? req.applicant : owner(req), "HANDOVER_REPORTED", req, { history: h });
  const latest = (p: string) => [...reports].reverse().find((r) => r.req === req && r.party === p);
  const o = latest("OWNER");
  const a = latest("APPLICANT");
  if (o && a && (o.outcome !== a.outcome || o.handoverDaysAgo !== a.handoverDaysAgo) && !req.disputed) {
    req.disputed = true;
    req.followUpRequired = true;
    const s = addHistory(req, "HANDOVER_REPORTED", "HANDOVER_REPORTED", "SYSTEM", null, "รายงานสองฝ่ายไม่ตรงกัน · ต้องให้ผู้ดูแลตรวจสอบ", h.ago, false);
    notify(req.applicant, "HANDOVER_DISPUTED", req, { history: s });
    notify(owner(req), "HANDOVER_DISPUTED", req, { history: s });
  }
}
function confirm(req: Req, party: "OWNER" | "APPLICANT", ago: number) {
  const actor = party === "OWNER" ? owner(req) : req.applicant;
  const h = addHistory(req, "HANDOVER_REPORTED", "HANDOVER_REPORTED", party, actor, "ยืนยันรายละเอียดส่งมอบ", ago, false);
  if (party === "OWNER") req.ownerConfirmedAgo = h.ago;
  else req.applicantConfirmedAgo = h.ago;
  notify(party === "OWNER" ? req.applicant : owner(req), "HANDOVER_CONFIRMED", req, { history: h });
  if (req.ownerConfirmedAgo !== null && req.applicantConfirmedAgo !== null && !req.disputed) complete(req, h.ago, "SYSTEM");
}
function complete(req: Req, ago: number, by: "SYSTEM" | DemoUser, resolution = "") {
  const admin = by === "SYSTEM" ? null : by;
  const h = addHistory(req, "HANDOVER_REPORTED", "COMPLETED", admin ? "ADMIN" : "SYSTEM", admin,
    admin ? "ผู้ดูแลยืนยันผลตรวจสอบ · รับเลี้ยงสำเร็จ" : "ยืนยันส่งมอบครบสองฝ่าย · รับเลี้ยงสำเร็จ", ago);
  req.completedAgo = h.ago;
  if (admin) {
    req.verifiedAgo = h.ago; req.verifiedBy = admin; req.resolution = resolution; req.disputed = false; req.followUpRequired = false; req.escalated = false;
    followUp(req, "VERIFY", resolution, admin, h.ago);
  }
  notify(req.applicant, "ADOPTION_COMPLETED", req, { history: h });
  notify(owner(req), "ADOPTION_COMPLETED", req, { history: h });
  systemRejectOthers(req, "น้องได้บ้านแล้ว", h.ago);
}
// หลังตอบรับคนหนึ่ง เจ้าของมักปฏิเสธผู้ขอรายอื่นที่รออยู่ (ไม่ใช่ทุกราย — บางคนยังรอเผื่อการนัดล่ม)
function declineWaiting(main: Req, ago: number) {
  for (const other of requests.filter((r) => r.pet === main.pet && r !== main && r.stage === "PENDING" && r.createdAgo > ago)) {
    if (chance(0.6)) ownerReject(other, ago);
  }
}
function cancel(req: Req, ago: number) {
  const h = addHistory(req, req.stage, "CANCELLED", "APPLICANT", req.applicant, "ผู้ขอยกเลิกคำขอ", ago);
  notify(owner(req), "REQUEST_CANCELLED", req, { history: h });
}

// ผู้ขอ: ไม่ใช่เจ้าของ ไม่ใช่ผู้ดูแล ไม่ใช่บัญชีที่ถูกระงับ/เพิ่งสมัคร และไม่ซ้ำกับคำขอเดิมของน้องตัวนี้
const applicantPool = DEMO_DATASET_USERS.filter((u) => !u.role && !["suspended", "new_user", "shelter", "rescue_group"].includes(u.persona));
const heavy = user("u22");
function applicantFor(pet: Pet, preferred?: DemoUser): DemoUser {
  const taken = new Set(requests.filter((r) => r.pet === pet).map((r) => r.applicant.key));
  const ok = (u: DemoUser) => u.key !== pet.owner.key && !taken.has(u.key);
  if (preferred && ok(preferred)) return preferred;
  if (chance(0.18) && ok(heavy)) return heavy; // ผู้ใช้ที่ส่งคำขอหลายครั้ง
  let candidate = pick(applicantPool);
  while (!ok(candidate)) candidate = pick(applicantPool);
  return candidate;
}
// คำขออื่นของน้องตัวเดียวกันมาถึงภายใน ~1.5 ชม. หลังคำขอแรก — ก่อนเจ้าของตัดสิน (เร็วสุด 2 ชม.)
// จึงไม่มีคำขอที่เกิดหลังน้องได้บ้านแล้ว และการปฏิเสธอัตโนมัติไม่เกิดก่อนคำขอนั้น
const others = (pet: Pet, count: number, baseAgo: number) => {
  for (let i = 0; i < count; i++) createRequest(pet, applicantFor(pet), after(baseAgo, 20 + i * 30, 50 + i * 30));
};

// ---------- สถานการณ์ตามตำแหน่งของน้อง ----------
const adopter = user("u25");
const canceller = user("u24");
const rejectedUser = user("u26");
for (let i = 0; i < 100; i++) {
  const pet = pets[i];
  const start = pet.createdAgo - int(1, 5) * D;
  if (i <= 11) {
    // รับเลี้ยงสำเร็จ (2 เคสผ่านข้อพิพาท + ผู้ดูแลตรวจ)
    const main = createRequest(pet, applicantFor(pet, i <= 2 ? adopter : undefined), start);
    others(pet, i % 3, start);
    let t = after(main.createdAgo, 2 * H, i <= 5 ? 6 * H : 2 * D); // เจ้าของตอบไว
    accept(main, t);
    t = after(t, 1 * D, 3 * D); arrange(main, t);
    const handoverDay = Math.max(1, Math.floor(after(t, 1 * D, 4 * D) / D));
    t = after(t, 1 * D, 4 * D); report(main, "OWNER", handoverDay, t, "HANDED_OVER", chance(0.5) ? "ส่งมอบที่บ้านผู้รับ พร้อมสมุดวัคซีน" : "");
    if (i === 10 || i === 11) {
      t = after(t, 2 * H, 1 * D); report(main, "APPLICANT", handoverDay + 2, t); // วันที่ไม่ตรง → ข้อพิพาท
      const admin = admins[i % 2];
      t = after(t, 3 * H, 1 * D); followUp(main, "NOTE", "รอเอกสารเพิ่มเติม: ขอรูปถ่ายวันส่งมอบจากทั้งสองฝ่าย", admin, t);
      t = after(t, 2 * H, 1 * D); followUp(main, "CONTACT", "โทรคุยทั้งสองฝ่ายแล้ว ผู้ขอกรอกวันที่ผิด", admin, t);
      t = after(t, 1 * H, 6 * H); report(main, "APPLICANT", handoverDay, t, "HANDED_OVER", "แก้วันที่ให้ตรงกับวันส่งมอบจริง");
      t = after(t, 1 * H, 8 * H); confirm(main, "APPLICANT", t);
      t = after(t, 1 * H, 8 * H); confirm(main, "OWNER", t);
      t = after(t, 2 * H, 1 * D); complete(main, t, admin, "ตรวจรูปถ่ายวันส่งมอบและโทรยืนยันทั้งสองฝ่ายแล้ว");
    } else {
      if (i % 2 === 0) { t = after(t, 1 * H, 6 * H); report(main, "OWNER", handoverDay, t, "HANDED_OVER", "แก้ไขรายละเอียด: ส่งมอบพร้อมกรงและอาหาร 1 ถุง"); }
      t = after(t, 2 * H, 1 * D); report(main, "APPLICANT", handoverDay, t, "HANDED_OVER", chance(0.4) ? "รับน้องแล้ว น้องปรับตัวได้ดี" : "");
      t = after(t, 1 * H, 12 * H); confirm(main, "APPLICANT", t);
      t = after(t, 1 * H, 12 * H); confirm(main, "OWNER", t);
      if (i % 3 === 0) { t = after(t, 1 * D, 2 * D); followUp(main, "VERIFY", "สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี", admins[0], t); main.verifiedAgo = minutes(t); main.verifiedBy = admins[0]; main.resolution = "สุ่มตรวจ: โทรสอบถามผู้รับเลี้ยง น้องสุขภาพดี"; }
      if (i % 4 === 1) { t = after(t, 1 * D, 2 * D); followUp(main, "CLOSE", "ปิดเคสหลังรับเลี้ยงสำเร็จ", admins[1], t); }
    }
  } else if (i <= 15) {
    // อนุมัติจากระบบเดิม → รอผู้ดูแลยืนยันการส่งมอบ
    const main = createRequest(pet, applicantFor(pet), start);
    others(pet, 1, start);
    const t = after(main.createdAgo, 3 * H, 2 * D);
    legacyApprove(main, t);
    systemRejectOthers(main, "เจ้าของอนุมัติผู้ขอรายอื่นแล้ว", t);
    if (i <= 13) followUp(main, "CONTACT", "โทรหาเจ้าของแล้ว รอยืนยันวันส่งมอบจริง", admins[i % 2], after(t, 1 * D, 3 * D));
  } else if (i <= 23) {
    // แจ้งส่งมอบแล้ว: ฝ่ายเดียว / ตรงกันยืนยันฝ่ายเดียว / ตรงกันยังไม่ยืนยัน / ข้อพิพาท
    const main = createRequest(pet, applicantFor(pet), start);
    others(pet, i % 2, start);
    let t = after(main.createdAgo, 3 * H, 1 * D); accept(main, t);
    declineWaiting(main, after(t, 1 * H, 6 * H));
    t = after(t, 1 * D, 2 * D); arrange(main, t);
    const day = Math.max(1, Math.floor(after(t, 1 * D, 2 * D) / D));
    t = after(t, 1 * D, 2 * D); report(main, "OWNER", day, t);
    if (i >= 18) { t = after(t, 2 * H, 1 * D); report(main, "APPLICANT", i >= 22 ? day + 2 : day, t, "HANDED_OVER", i >= 22 ? "จำวันที่ได้ว่าเป็นอีกวัน" : ""); }
    if (i === 18 || i === 19) { t = after(t, 1 * H, 6 * H); confirm(main, "OWNER", t); }
    if (i === 16 || i === 17) followUp(main, "CONTACT", "เตือนผู้ขอให้รายงานการรับน้องในระบบ", admins[i % 2], after(t, 1 * D, 2 * D));
    if (i === 20) { t = after(t, 2 * H, 8 * H); report(main, "OWNER", day, t, "HANDED_OVER", "เพิ่มรายละเอียด: ส่งมอบพร้อมสมุดวัคซีน"); }
    if (i === 22) followUp(main, "CONTACT", "ติดต่อผู้ขอไม่สำเร็จ โทร 2 ครั้งไม่รับสาย", admins[0], after(t, 4 * H, 1 * D));
    if (i === 23) { followUp(main, "NOTE", "ข้อมูลไม่ตรงกันเรื่องวันส่งมอบ รอหลักฐานเพิ่ม", admins[1], after(t, 2 * H, 8 * H)); followUp(main, "ESCALATE", "ส่งต่อหัวหน้าทีมตรวจสอบ", admins[1], after(t, 9 * H, 20 * H)); }
  } else if (i <= 31) {
    const main = createRequest(pet, applicantFor(pet), start);
    others(pet, 1 + (i % 2), start);
    let t = after(main.createdAgo, 3 * H, 1 * D); accept(main, t);
    declineWaiting(main, after(t, 1 * H, 6 * H));
    t = after(t, 1 * D, 2 * D); arrange(main, t);
    if (i % 2 === 0) followUp(main, "NOTE", "ติดตามวันนัดส่งมอบ ทั้งสองฝ่ายยืนยันว่ากำลังนัดกันอยู่", admins[i % 2], after(t, 1 * D, 3 * D));
  } else if (i <= 41) {
    const main = createRequest(pet, applicantFor(pet), start);
    others(pet, 1 + (i % 2), start);
    const t = after(main.createdAgo, 3 * H, 1 * D);
    accept(main, t);
    declineWaiting(main, after(t, 1 * H, 6 * H));
  } else if (i <= 47) {
    // ผู้ขอยกเลิกหลังเจ้าของตอบรับ
    const main = createRequest(pet, applicantFor(pet, canceller), start);
    if (i % 2 === 0) others(pet, 1, start);
    let t = after(main.createdAgo, 3 * H, 1 * D); accept(main, t);
    if (i % 3 === 0) { t = after(t, 1 * D, 2 * D); arrange(main, t); }
    cancel(main, after(t, 1 * D, 3 * D));
  } else if (i <= 77) {
    // รอเจ้าของตอบ: 6 ชม. ถึงเกิน 7 วัน (น้องของเจ้าของที่ไม่ตอบอยู่ช่วงแรก)
    const idleHours = i <= 53 ? [80, 100, 170, 200, 240, 300][i - 48] : [6, 12, 20, 26, 30, 40, 50, 60, 75, 90][(i - 54) % 10];
    const main = createRequest(pet, applicantFor(pet), idleHours * H);
    others(pet, i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0, idleHours * H);
    for (const r of requests.filter((x) => x.pet === pet)) {
      const idle = r.lastActivityAgo / H;
      if (idle >= 24) notify(owner(r), "OWNER_REMINDER", r, { activity: r });
      if (idle >= 48) { notify(owner(r), "OWNER_SECOND_REMINDER", r, { activity: r }); notify(null, "ADMIN_FOLLOW_UP", r, { activity: r }); }
      if (idle >= 72) notify(null, "ESCALATION", r, { activity: r });
    }
    const admin = admins[i % 2];
    if (idleHours >= 48) followUp(main, "CONTACT", pick(["โทรหาเจ้าของแล้ว ไม่รับสาย", "ส่งข้อความหาเจ้าของแล้ว รอตอบกลับ", "เจ้าของแจ้งว่าจะตอบภายในวันนี้"]), admin, main.createdAgo - 47 * H);
    if (idleHours >= 60) followUp(main, "FLAG", "", admin, main.createdAgo - 59 * H);
    if (idleHours >= 75) followUp(main, "CONTACT", "ติดต่อเจ้าของไม่สำเร็จ ครั้งที่ 2", admin, main.createdAgo - 74 * H);
    if (idleHours >= 100) followUp(main, "ESCALATE", "เจ้าของเงียบเกิน 4 วัน ส่งต่อเร่งด่วน", admin, main.createdAgo - 99 * H);
    if (idleHours === 50) { followUp(main, "FLAG", "", admin, main.createdAgo - 48.5 * H); followUp(main, "RESOLVE", "เจ้าของแจ้งว่ากำลังคุยกับผู้ขอทางโทรศัพท์", admin, main.createdAgo - 49.5 * H); }
  } else if (i <= 82) {
    // ถูกปฏิเสธทั้งหมด → รอบ้านต่อ
    const first = createRequest(pet, applicantFor(pet, rejectedUser), start);
    ownerReject(first, after(first.createdAgo, 2 * H, 1 * D));
    if (i % 2 === 0) { const second = createRequest(pet, applicantFor(pet), after(start, 1 * D, 3 * D)); ownerReject(second, after(second.createdAgo, 3 * H, 1 * D)); }
    if (i === 78) followUp(first, "CLOSE", "ปิดเคส: เจ้าของปฏิเสธพร้อมเหตุผลแล้ว", admins[0], after(first.lastActivityAgo, 1 * D, 2 * D));
  }
}

// เติมคำขอที่รอพิจารณาให้ครบ 180 (กระจายไปน้องที่ยังเปิดรับ ไม่ชนกฎ)
const openForMore = pets.filter((_pet, i) => (i >= 24 && i <= 41) || (i >= 54 && i <= 77));
for (let n = 0; requests.length < 180; n++) {
  const pet = openForMore[n % openForMore.length];
  if (requests.filter((r) => r.pet === pet).length >= 5) continue;
  const base = requests.filter((r) => r.pet === pet).reduce((min, r) => Math.min(min, r.createdAgo), pet.createdAgo);
  createRequest(pet, applicantFor(pet), Math.max(3 * H, base - int(1, 30) * H));
}

// สถานะน้องตามคำขอ (กฎเดียวกับ derivePetStatus)
for (const pet of pets) {
  const mine = requests.filter((r) => r.pet === pet);
  pet.status = mine.some((r) => r.stage === "COMPLETED" || r.legacyReview) ? "ADOPTED"
    : mine.some((r) => ["PENDING", "ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED"].includes(r.stage)) ? "PENDING" : "AVAILABLE";
}

// ผลตรวจโพสต์ (เฉพาะน้องที่ไม่มีคำขอ — โพสต์ที่ซ่อนอยู่ไม่มีใครยื่นคำขอได้)
const moderate = (pet: Pet, visibility: Pet["visibility"], reason: string, admin: DemoUser, ago: number) => {
  pet.visibility = visibility; pet.moderationReason = reason; pet.moderatedBy = admin; pet.moderatedAgo = minutes(ago);
};
for (const [index, visibility, reason] of [
  [94, "HIDDEN", "รายงานว่าโพสต์ซ้ำกับโพสต์อื่น"],
  [95, "HIDDEN", "ข้อมูลติดต่อในคำอธิบายไม่เหมาะสม"],
  [96, "CHANGES_REQUESTED", "รูปไม่ชัด กรุณาเพิ่มรูปน้องตัวจริง"],
  [97, "CHANGES_REQUESTED", "ข้อมูลวัคซีนไม่ครบ"],
  [98, "REVIEW", "เจ้าของแก้ไขแล้ว รอตรวจอีกครั้ง"],
] as const) {
  const pet = pets[index];
  moderate(pet, visibility, reason, admins[index % 2], pet.createdAgo - 2 * D);
}
moderate(pets[99], "HIDDEN", "ตรวจสอบรายงาน", admins[0], pets[99].createdAgo - 3 * D);
moderate(pets[99], "VISIBLE", "", admins[0], pets[99].createdAgo - 4 * D);
pets[99].moderationReason = "";

// ---------- รายการโปรด ~150 ----------
const collector = user("u23");
const favoriteKeys = new Set<string>();
const visiblePets = pets.filter((p) => p.visibility === "VISIBLE");
const addFavorite = (u: DemoUser, pet: Pet) => {
  const key = `${u.key}:${pet.id}`;
  if (pet.owner.key === u.key || favoriteKeys.has(key)) return;
  favoriteKeys.add(key);
  favorites.push({ user: u, pet, ago: minutes(pet.createdAgo - int(1, 20) * D) });
};
for (let n = 0; favorites.filter((f) => f.user === collector).length < 25; n++) addFavorite(collector, visiblePets[(n * 3) % visiblePets.length]);
const favoriteFans = DEMO_DATASET_USERS.filter((u) => !u.role && u.persona !== "suspended" && u.persona !== "new_user");
while (favorites.length < 150) addFavorite(pick(favoriteFans), pick(visiblePets));

// ---------- ประกาศ 12 (3 รายการเดิมของหน้าแรก + ตัวอย่าง) ----------
const contactNote = "ข้อมูลตัวอย่าง — ไม่ใช่ช่องทางติดต่อจริง";
const annRows: Omit<Announcement, "id" | "author">[] = [
  { title: "ฉีดวัคซีนพิษสุนัขบ้าฟรี", category: "ประชาสัมพันธ์", description: "พาน้องหมาแมวอายุ 3 เดือนขึ้นไปมาฉีดวัคซีนพิษสุนัขบ้าฟรี ลงทะเบียนหน้างานตามลำดับคิว ไม่ต้องจองล่วงหน้า", eventDaysAhead: null, eventTime: "", location: "", contact: "", cta: "ดูรายละเอียด", destination: "/announcements/rabies-vaccine", status: "PUBLISHED", order: 1, isDemo: false, publishedAgo: 20 * D, publishInMinutes: null, expiredAgo: null, createdAgo: 21 * D },
  { title: "บริจาคอาหารให้น้องในมูลนิธิ", category: "ร่วมช่วยเหลือ", description: "อาหารสุนัข อาหารแมว ทรายแมว ผ้าห่ม และอุปกรณ์ดูแลสัตว์ ช่วยน้องที่ยังรอบ้านได้ทุกตัว แจ้งความประสงค์แล้วนัดวันส่งของ", eventDaysAhead: null, eventTime: "ทุกวัน 09:00–17:00 น.", location: "", contact: "", cta: "วิธีบริจาค", destination: "/support/donate-food", status: "PUBLISHED", order: 2, isDemo: false, publishedAgo: 18 * D, publishInMinutes: null, expiredAgo: null, createdAgo: 19 * D },
  { title: "ทำหมันราคาพิเศษสำหรับน้องจร", category: "ผู้สนับสนุน", description: "ลดจำนวนสัตว์จรเกิดใหม่ กับคลินิกพันธมิตรที่ให้ราคาพิเศษแก่ผู้ดูแลน้องจรและผู้รับเลี้ยงจาก PawHome", eventDaysAhead: null, eventTime: "จันทร์–เสาร์ 09:00–17:00 น.", location: "", contact: "", cta: "จองคิว", destination: "/partners/spay-neuter", status: "PUBLISHED", order: 3, isDemo: false, publishedAgo: 16 * D, publishInMinutes: null, expiredAgo: null, createdAgo: 17 * D },
  { title: "[ตัวอย่าง] ตลาดนัดรับเลี้ยงน้องหมาแมว", category: "กิจกรรม", description: "กิจกรรมสมมติสำหรับทดสอบระบบประกาศ — พบน้องจากบ้านพักพิงทดสอบ (ข้อมูลตัวอย่าง)", eventDaysAhead: 14, eventTime: "10:00–16:00", location: "สถานที่สมมติ (ข้อมูลตัวอย่าง)", contact: contactNote, cta: "ดูน้องทั้งหมด", destination: "/pets", status: "PUBLISHED", order: 4, isDemo: true, publishedAgo: 5 * D, publishInMinutes: null, expiredAgo: null, createdAgo: 6 * D },
  { title: "[ตัวอย่าง] อาสาสมัครพาน้องเดินเล่นวันเสาร์", category: "ร่วมช่วยเหลือ", description: "ประกาศสมมติ — รับอาสาสมัครพาน้องในบ้านพักพิงทดสอบเดินเล่น (ข้อมูลตัวอย่าง)", eventDaysAhead: 7, eventTime: "08:00–10:00", location: "สถานที่สมมติ (ข้อมูลตัวอย่าง)", contact: contactNote, cta: "ดูรายละเอียด", destination: "/guide", status: "PUBLISHED", order: 5, isDemo: true, publishedAgo: 3 * D, publishInMinutes: null, expiredAgo: null, createdAgo: 4 * D },
  { title: "[ตัวอย่าง] ข่าวสาร: วิธีเตรียมบ้านก่อนรับน้อง", category: "ข่าวสาร", description: "บทความสมมติ — เช็กลิสต์อุปกรณ์และการเตรียมพื้นที่ก่อนรับเลี้ยง (ข้อมูลตัวอย่าง)", eventDaysAhead: null, eventTime: "", location: "", contact: contactNote, cta: "อ่านคู่มือ", destination: "/guide", status: "PUBLISHED", order: 6, isDemo: true, publishedAgo: 2 * D, publishInMinutes: null, expiredAgo: null, createdAgo: 2 * D + 3 * H },
  { title: "[ตัวอย่าง] ผู้สนับสนุนอาหารประจำเดือน", category: "ผู้สนับสนุน", description: "ประกาศสมมติ — ขอบคุณผู้สนับสนุนทดสอบ (ไม่ใช่บริษัทจริง)", eventDaysAhead: null, eventTime: "", location: "", contact: contactNote, cta: "ดูรายละเอียด", destination: "/", status: "PUBLISHED", order: 7, isDemo: true, publishedAgo: 40 * D, publishInMinutes: null, expiredAgo: 10 * D, createdAgo: 41 * D },
  { title: "[ตัวอย่าง] กิจกรรมตรวจสุขภาพน้องฟรี (หมดเขตแล้ว)", category: "กิจกรรม", description: "กิจกรรมสมมติที่หมดเขตแล้ว ใช้ทดสอบประกาศหมดอายุ (ข้อมูลตัวอย่าง)", eventDaysAhead: -20, eventTime: "09:00–15:00", location: "สถานที่สมมติ (ข้อมูลตัวอย่าง)", contact: contactNote, cta: "ดูรายละเอียด", destination: "/", status: "PUBLISHED", order: 8, isDemo: true, publishedAgo: 30 * D, publishInMinutes: null, expiredAgo: 15 * D, createdAgo: 31 * D },
  { title: "[ตัวอย่าง] เปิดรับบ้านอุปถัมภ์ชั่วคราว (ตั้งเวลา)", category: "ประชาสัมพันธ์", description: "ประกาศสมมติที่ตั้งเวลาเผยแพร่ล่วงหน้า (ข้อมูลตัวอย่าง)", eventDaysAhead: 21, eventTime: "", location: "", contact: contactNote, cta: "ดูรายละเอียด", destination: "/pets", status: "PUBLISHED", order: 9, isDemo: true, publishedAgo: null, publishInMinutes: 5 * D, expiredAgo: null, createdAgo: 1 * D },
  { title: "[ร่าง] สรุปยอดรับเลี้ยงประจำเดือน", category: "ข่าวสาร", description: "ฉบับร่าง ยังไม่เผยแพร่ (ข้อมูลตัวอย่าง)", eventDaysAhead: null, eventTime: "", location: "", contact: "", cta: "อ่านต่อ", destination: "/", status: "DRAFT", order: 10, isDemo: true, publishedAgo: null, publishInMinutes: null, expiredAgo: null, createdAgo: 12 * H },
  { title: "[ร่าง] เวิร์กช็อปฝึกน้องเบื้องต้น", category: "กิจกรรม", description: "ฉบับร่าง ยังไม่เผยแพร่ (ข้อมูลตัวอย่าง)", eventDaysAhead: 30, eventTime: "13:00–16:00", location: "สถานที่สมมติ (ข้อมูลตัวอย่าง)", contact: contactNote, cta: "ดูรายละเอียด", destination: "/guide", status: "DRAFT", order: 11, isDemo: true, publishedAgo: null, publishInMinutes: null, expiredAgo: null, createdAgo: 2 * D },
  { title: "[ร่าง] ขอบคุณอาสาสมัคร", category: "ประชาสัมพันธ์", description: "ฉบับร่าง ยังไม่เผยแพร่ (ข้อมูลตัวอย่าง)", eventDaysAhead: null, eventTime: "", location: "", contact: "", cta: "อ่านต่อ", destination: "/", status: "DRAFT", order: 12, isDemo: true, publishedAgo: null, publishInMinutes: null, expiredAgo: null, createdAgo: 3 * D },
];
annRows.forEach((row, index) => {
  const ann: Announcement = { ...row, id: ID_RANGES.announcements[0] + index, author: admins[index % 2] };
  announcements.push(ann);
});
// แจ้งเตือนประกาศ: เฉพาะประกาศที่ไม่ใช่ตัวอย่าง (เหมือน Backend) → ประกาศแรกถึงผู้ใช้ทุกคนที่ไม่ถูกระงับ
for (const u of DEMO_DATASET_USERS.filter((x) => x.persona !== "suspended")) notify(u, "ANNOUNCEMENT_PUBLISHED", null, { announcement: announcements[0] }, announcements[0]);


// ---------- ตรวจกฎก่อนเขียนไฟล์ (fail fast) ----------
const fail = (message: string) => { throw new Error(`ชุดข้อมูลผิดกฎ: ${message}`); };
for (const r of requests) {
  if (r.applicant.key === r.pet.owner.key) fail(`คำขอ ${r.id} ผู้ขอเป็นเจ้าของ`);
  const rows = history.filter((h) => h.req === r);
  if (rows[0].from !== null || rows[0].ago !== r.createdAgo) fail(`คำขอ ${r.id} ไทม์ไลน์ไม่ได้เริ่มที่การส่งคำขอ`);
  if (rows.at(-1)!.to !== r.stage) fail(`คำขอ ${r.id} ไทม์ไลน์ไม่จบที่ stage ปัจจุบัน`);
  for (let k = 1; k < rows.length; k++) if (rows[k].ago > rows[k - 1].ago) fail(`คำขอ ${r.id} เวลาไทม์ไลน์ย้อนกลับ`);
  if (r.stage === "COMPLETED" && !(r.ownerConfirmedAgo !== null && r.applicantConfirmedAgo !== null) && !r.verifiedBy) fail(`คำขอ ${r.id} สำเร็จโดยยืนยันไม่ครบ`);
}
const pairs = new Set<string>();
for (const r of requests) { const key = `${r.applicant.key}:${r.pet.id}`; if (pairs.has(key)) fail(`คำขอซ้ำ ${key}`); pairs.add(key); }
for (const pet of pets) if (requests.filter((r) => r.pet === pet && ["ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED", "COMPLETED"].includes(r.stage)).length > 1) fail(`น้อง ${pet.id} มีคำขอที่ตอบรับมากกว่าหนึ่ง`);

// ---------- เขียน SQL ----------
const q = (v: string | null) => (v === null ? "null::text" : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? "null::int" : String(v));
const b = (v: boolean) => (v ? "true" : "false");
const email = (u: DemoUser | null) => q(u?.email ?? null);
const values = (rows: string[][]) => rows.map((r) => `  (${r.join(", ")})`).join(",\n");
const ANCHOR_MINUTES = pets[0].createdAgo;
const anchor = `with a as (select created_at + make_interval(mins => ${ANCHOR_MINUTES}) as t from public.pets where id = ${pets[0].id})`;
const at = (col: string) => `a.t - make_interval(mins => v.${col})`;

const header = (file: string, title: string) => `-- =========================================================
-- PawHome demo dataset ${DATASET_ID} (v${DATASET_VERSION}) — ${title}
-- สร้างโดย backend/scripts/generate-demo-seed.ts (ห้ามแก้มือ: แก้ generator แล้วรันใหม่)
-- ข้อมูลสมมติทั้งหมด · ใช้กับ Local / PGlite / Supabase Development-Test เท่านั้น · ห้าม Production
-- รันซ้ำได้: ทุก insert ใช้ id ในช่วงของชุดข้อมูลนี้ + on conflict do nothing · ไม่ลบหรือแก้ข้อมูลอื่น
-- ไฟล์: ${file}
-- =========================================================
`;
// ทุกไฟล์ตรวจซ้ำ: มีบัญชี demo ครบ และฐานข้อมูลไม่มีข้อมูลของผู้ใช้จริง (กันรันบน Production)
const guard = `do $$
begin
  if (select count(*) from auth.users where email like 'demo-%@pawhome.test') < ${DEMO_DATASET_USERS.length} then
    raise exception 'ต้องมีบัญชี demo ครบ ${DEMO_DATASET_USERS.length} บัญชีใน Supabase Auth ก่อน — รัน: cd backend && npm run seed:demo-users';
  end if;
  if exists (select 1 from public.pets p join auth.users u on u.id = p.owner_id where u.email not like '%@pawhome.test')
     or exists (select 1 from public.adoption_requests r join auth.users u on u.id = r.user_id where u.email not like '%@pawhome.test') then
    raise exception 'พบข้อมูลของผู้ใช้จริง — seed นี้ใช้กับฐานข้อมูล Development/Test ที่ไม่มีข้อมูลจริงเท่านั้น';
  end if;
end $$;
`;
const needsAnchor = `do $$
begin
  if not exists (select 1 from public.pets where id = ${pets[0].id}) then
    raise exception 'ยังไม่มีน้อง id ${pets[0].id} (จุดยึดเวลา) — รัน 002-demo-pets.sql ก่อน';
  end if;
end $$;
`;
const setval = (table: string) => `select setval(pg_get_serial_sequence('public.${table}', 'id'), (select max(id) from public.${table}));\n`;

const files: Record<string, string> = {};
files["001-demo-profiles.sql"] = header("001-demo-profiles.sql", "profiles + ผู้ดูแลทดสอบ") + guard + `
-- profile สร้างโดย trigger on_auth_user_created อยู่แล้ว · เผื่อกรณี trigger ไม่ทำงาน
insert into public.profiles (id, name)
select u.id, v.name from (values
${values(DEMO_DATASET_USERS.map((u) => [q(u.email), q(u.name)]))}
) as v(email, name) join auth.users u on u.email = v.email
on conflict (id) do nothing;

-- ผู้ดูแลทดสอบ (Development เท่านั้น — ฐานข้อมูลที่ผ่าน guard ด้านบน)
insert into public.admin_memberships (user_id, role, granted_by)
select u.id, v.role, g.id from (values
${values(DEMO_DATASET_USERS.filter((u) => u.role).map((u) => [q(u.email), q(u.role!), email(u.role === "SUPER_ADMIN" ? null : superAdmin)]))}
) as v(email, role, granted_by) join auth.users u on u.email = v.email left join auth.users g on g.email = v.granted_by
on conflict (user_id) do nothing;

`;

files["002-demo-pets.sql"] = header("002-demo-pets.sql", "น้อง 100 ตัว") + guard + `
insert into public.pets (id, owner_id, name, species, breed, age_months, sex, province, image_url, description,
  vaccinated, sterilized, urgent, status, visibility, moderation_reason, moderated_at, moderated_by, created_at, updated_at)
select v.id, o.id, v.name, v.species, v.breed, v.age_months, v.sex, v.province, v.image_url, v.description,
  v.vaccinated, v.sterilized, v.urgent, v.status, v.visibility, v.moderation_reason,
  now() - make_interval(mins => v.moderated_m), m.id, now() - make_interval(mins => v.created_m), now() - make_interval(mins => v.created_m)
from (values
${values(pets.map((p) => [String(p.id), email(p.owner), q(p.name), q(p.species), q(p.breed), String(p.ageMonths), q(p.sex), q(p.province), q(p.imageUrl), q(p.description), b(p.vaccinated), b(p.sterilized), b(p.urgent), q(p.status), q(p.visibility), q(p.moderationReason), n(p.moderatedAgo), email(p.moderatedBy), String(p.createdAgo)]))}
) as v(id, owner_email, name, species, breed, age_months, sex, province, image_url, description, vaccinated, sterilized, urgent, status,
       visibility, moderation_reason, moderated_m, moderated_by_email, created_m)
join auth.users o on o.email = v.owner_email
left join auth.users m on m.email = v.moderated_by_email
on conflict (id) do nothing;
` + setval("pets");

files["003-demo-favorites.sql"] = header("003-demo-favorites.sql", "รายการโปรด") + guard + needsAnchor + `
${anchor}
insert into public.favorites (user_id, pet_id, created_at)
select u.id, v.pet_id, ${at("m")}
from (values
${values(favorites.map((f) => [email(f.user), String(f.pet.id), String(f.ago)]))}
) as v(email, pet_id, m) join auth.users u on u.email = v.email cross join a
on conflict (user_id, pet_id) do nothing;
`;

files["004-demo-adoptions.sql"] = header("004-demo-adoptions.sql", "คำขอรับเลี้ยง") + guard + needsAnchor + `
${anchor}
insert into public.adoption_requests (id, pet_id, user_id, phone, housing, message, status, stage, created_at, updated_at, last_activity_at,
  follow_up_required, escalated, disputed, legacy_review, handover_version, owner_confirmed_at, applicant_confirmed_at,
  completed_at, verified_at, verified_by, resolution, closed_at)
select v.id, v.pet_id, u.id, v.phone, v.housing, v.message, v.status, v.stage, ${at("created_m")}, ${at("activity_m")}, ${at("activity_m")},
  v.follow_up_required, v.escalated, v.disputed, v.legacy_review, v.handover_version, ${at("owner_confirmed_m")}, ${at("applicant_confirmed_m")},
  ${at("completed_m")}, ${at("verified_m")}, vb.id, v.resolution, ${at("closed_m")}
from (values
${values(requests.map((r) => [String(r.id), String(r.pet.id), email(r.applicant), q(r.phone), q(r.housing), q(r.message),
  q(r.stage === "PENDING" ? "PENDING" : r.stage === "REJECTED" || r.stage === "CANCELLED" ? r.stage : "APPROVED"), q(r.stage),
  String(r.createdAgo), String(r.lastActivityAgo), b(r.followUpRequired), b(r.escalated), b(r.disputed), b(r.legacyReview), String(r.handoverVersion),
  n(r.ownerConfirmedAgo), n(r.applicantConfirmedAgo), n(r.completedAgo), n(r.verifiedAgo), email(r.verifiedBy), q(r.resolution), n(r.closedAgo)]))}
) as v(id, pet_id, email, phone, housing, message, status, stage, created_m, activity_m, follow_up_required, escalated, disputed, legacy_review,
       handover_version, owner_confirmed_m, applicant_confirmed_m, completed_m, verified_m, verified_by_email, resolution, closed_m)
join auth.users u on u.email = v.email
left join auth.users vb on vb.email = v.verified_by_email
cross join a
on conflict (id) do nothing;
` + setval("adoption_requests");

const actorEmail = (h: History) => email(h.actor);
files["005-demo-timeline.sql"] = header("005-demo-timeline.sql", "ไทม์ไลน์ (adoption_stage_history)") + guard + needsAnchor + `
${anchor}
insert into public.adoption_stage_history (id, request_id, from_stage, to_stage, actor_id, actor_role, note, created_at)
select v.id, v.request_id, v.from_stage, v.to_stage, u.id, v.actor_role, v.note, ${at("m")}
from (values
${values(history.map((h) => [String(h.id), String(h.req.id), q(h.from), q(h.to), actorEmail(h), q(h.role), q(h.note), String(h.ago)]))}
) as v(id, request_id, from_stage, to_stage, actor_email, actor_role, note, m)
left join auth.users u on u.email = v.actor_email
cross join a
on conflict (id) do nothing;
` + setval("adoption_stage_history");

files["006-demo-handover.sql"] = header("006-demo-handover.sql", "รายงานส่งมอบ") + guard + needsAnchor + `
${anchor}
insert into public.adoption_handover_reports (id, request_id, party, handover_date, outcome, note, evidence_url, version, reporter_id, created_at)
select v.id, v.request_id, v.party, (a.t - make_interval(days => v.handover_days))::date, v.outcome, v.note, '', v.version, u.id, ${at("m")}
from (values
${values(reports.map((r) => [String(r.id), String(r.req.id), q(r.party), String(r.handoverDaysAgo), q(r.outcome), q(r.note), String(r.version), email(r.reporter), String(r.ago)]))}
) as v(id, request_id, party, handover_days, outcome, note, version, reporter_email, m)
join auth.users u on u.email = v.reporter_email
cross join a
on conflict (id) do nothing;
` + setval("adoption_handover_reports");

files["007-demo-followups.sql"] = header("007-demo-followups.sql", "บันทึกติดตามของผู้ดูแล") + guard + needsAnchor + `
${anchor}
insert into public.adoption_follow_ups (id, request_id, kind, note, actor_id, created_at)
select v.id, v.request_id, v.kind, v.note, u.id, ${at("m")}
from (values
${values(followUps.map((f) => [String(f.id), String(f.req.id), q(f.kind), q(f.note), email(f.actor), String(f.ago)]))}
) as v(id, request_id, kind, note, actor_email, m)
join auth.users u on u.email = v.actor_email
cross join a
on conflict (id) do nothing;
` + setval("adoption_follow_ups");

files["008-demo-announcements.sql"] = header("008-demo-announcements.sql", "ประกาศ 12 รายการ (3 รายการเดิมของหน้าแรก + ตัวอย่าง)") + guard + needsAnchor + `
${anchor}
insert into public.announcements (id, title, category, description, event_date, event_time, location, contact, cta, destination, image_url,
  status, display_order, is_demo, published_at, publish_at, expire_at, created_by, updated_by, created_at, updated_at)
select v.id, v.title, v.category, v.description, (a.t + make_interval(days => v.event_days))::date, v.event_time, v.location, v.contact, v.cta,
  v.destination, '', v.status, v.display_order, v.is_demo, ${at("published_m")},
  case when v.publish_in_m is null then null else a.t + make_interval(mins => v.publish_in_m) end,
  ${at("expired_m")}, u.id, u.id, ${at("created_m")}, ${at("created_m")}
from (values
${values(announcements.map((x) => [String(x.id), q(x.title), q(x.category), q(x.description), n(x.eventDaysAhead), q(x.eventTime), q(x.location), q(x.contact), q(x.cta), q(x.destination), q(x.status), String(x.order), b(x.isDemo), n(x.publishedAgo), n(x.publishInMinutes), n(x.expiredAgo), String(x.createdAgo), email(x.author)]))}
) as v(id, title, category, description, event_days, event_time, location, contact, cta, destination, status, display_order, is_demo,
       published_m, publish_in_m, expired_m, created_m, author_email)
join auth.users u on u.email = v.author_email
cross join a
on conflict (id) do nothing;
` + setval("announcements");

const notificationAt = (x: Notification) =>
  "history" in x.ref ? `(select created_at from public.adoption_stage_history where id = ${x.ref.history.id})`
    : "activity" in x.ref ? `(select last_activity_at from public.adoption_requests where id = ${x.ref.activity.id})`
      : `(select published_at from public.announcements where id = ${x.ref.announcement.id})`;
files["009-demo-notifications.sql"] = header("009-demo-notifications.sql", "แจ้งเตือนในเว็บ (อ้างเวลาจากเหตุการณ์จริงในชุดข้อมูล)") + guard + needsAnchor + `
-- activity_at ดึงจากแถวที่อ้าง (ไทม์ไลน์ / last_activity_at ของคำขอ / เวลาเผยแพร่ประกาศ) → ตรงกันเสมอ
${anchor}
insert into public.notification_events (id, request_id, announcement_id, recipient_id, kind, activity_at, channel, read_at, created_at)
select v.id, v.request_id, v.announcement_id, u.id, v.kind, v.activity_at, 'IN_APP', ${at("read_m")}, v.activity_at
from (values
${values(notifications.map((x) => [String(x.id), n(x.req?.id ?? null), n(x.announcement?.id ?? null), email(x.recipient), q(x.kind), notificationAt(x), n(x.readAgo)]))}
) as v(id, request_id, announcement_id, recipient_email, kind, activity_at, read_m)
left join auth.users u on u.email = v.recipient_email
cross join a
on conflict do nothing;
` + setval("notification_events");


const inRange = (col: string, range: readonly [number, number]) => `${col} between ${range[0]} and ${range[1]}`;
files["999-cleanup-demo.sql"] = header("999-cleanup-demo.sql", "ลบเฉพาะชุดข้อมูลทดสอบนี้") + guard + `
-- ลบเฉพาะแถวในช่วง id ของชุดข้อมูลนี้ที่เป็นของบัญชี demo-*@pawhome.test (ไม่ใช้ TRUNCATE / ไม่ลบทั้งตาราง)
-- คำขอ ไทม์ไลน์ รายงาน บันทึกติดตาม แจ้งเตือน รายการโปรด ถูกลบตาม FK (on delete cascade) ของน้อง/ประกาศ
-- ไม่ลบ: บัญชีใน Supabase Auth (ลบผ่าน Dashboard/Admin API)
begin;
delete from public.pets p using auth.users u
where p.owner_id = u.id and u.email like 'demo-%@pawhome.test' and ${inRange("p.id", ID_RANGES.pets)};
delete from public.announcements where ${inRange("id", ID_RANGES.announcements)} and is_demo in (true, false)
  and created_by in (select id from auth.users where email like 'demo-%@pawhome.test');
delete from public.notification_events n using auth.users u
where n.recipient_id = u.id and u.email like 'demo-%@pawhome.test' and ${inRange("n.id", ID_RANGES.notifications)};
delete from public.admin_memberships m using auth.users u where m.user_id = u.id and u.email like 'demo-%@pawhome.test';
commit;
`;

// ---------- ผลรวมที่คาดหวัง (ใช้ใน verify-demo-data.sql และรายงาน) ----------
const count = <T>(rows: T[], f: (x: T) => boolean = () => true) => rows.filter(f).length;
const expected = {
  users: DEMO_DATASET_USERS.length,
  admins: count(DEMO_DATASET_USERS, (u) => Boolean(u.role)),
  pets: pets.length,
  petsByStatus: { AVAILABLE: count(pets, (p) => p.status === "AVAILABLE"), PENDING: count(pets, (p) => p.status === "PENDING"), ADOPTED: count(pets, (p) => p.status === "ADOPTED") },
  petsByVisibility: { VISIBLE: count(pets, (p) => p.visibility === "VISIBLE"), HIDDEN: count(pets, (p) => p.visibility === "HIDDEN"), CHANGES_REQUESTED: count(pets, (p) => p.visibility === "CHANGES_REQUESTED"), REVIEW: count(pets, (p) => p.visibility === "REVIEW") },
  favorites: favorites.length,
  requests: requests.length,
  requestsByStage: Object.fromEntries(["PENDING", "ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED", "COMPLETED", "REJECTED", "CANCELLED"].map((s) => [s, count(requests, (r) => r.stage === s)])),
  legacyReview: count(requests, (r) => r.legacyReview),
  disputed: count(requests, (r) => r.disputed),
  escalated: count(requests, (r) => r.escalated),
  closed: count(requests, (r) => r.closedAgo !== null),
  timelineEvents: history.length,
  adminTimelineEvents: history.length + reports.length + followUps.length, // GET /api/admin/adoptions/:id/timeline รวมสามแหล่งนี้
  handoverReports: reports.length,
  followUps: followUps.length,
  announcements: announcements.length,
  notifications: notifications.length,
  unreadNotifications: count(notifications, (x) => x.readAgo === null && x.recipient !== null),
};

const outDir = new URL("../../database/seeds/", import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [name, sql] of Object.entries(files)) writeFileSync(new URL(name, outDir), sql);
writeFileSync(new URL("manifest.json", outDir), `${JSON.stringify({ datasetId: DATASET_ID, version: DATASET_VERSION, generator: "backend/scripts/generate-demo-seed.ts", runOrder: Object.keys(files).filter((f) => !f.startsWith("999")), cleanup: "999-cleanup-demo.sql", idRanges: ID_RANGES, anchor: { petId: pets[0].id, minutesBeforeSeed: ANCHOR_MINUTES }, expected }, null, 2)}\n`);

// ค่าที่คาดหวังสำหรับ verify-demo-data.sql (ตรวจจากฐานข้อมูลจริงหลัง seed — ห้ามแก้มือเพื่อซ่อนปัญหา)
const rows: [string, string, string][] = [
  ["count: demo users", String(expected.users), "select count(*) from auth.users where email like 'demo-%@pawhome.test'"],
  ["count: demo admins", String(expected.admins), "select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like 'demo-%@pawhome.test'"],
  ["count: pets", String(expected.pets), `select count(*) from public.pets where ${inRange("id", ID_RANGES.pets)}`],
  ...Object.entries(expected.petsByStatus).map(([s, c]) => [`count: pets ${s}`, String(c), `select count(*) from public.pets where ${inRange("id", ID_RANGES.pets)} and status = '${s}'`] as [string, string, string]),
  ...Object.entries(expected.petsByVisibility).map(([s, c]) => [`count: pets visibility ${s}`, String(c), `select count(*) from public.pets where ${inRange("id", ID_RANGES.pets)} and visibility = '${s}'`] as [string, string, string]),
  ["count: favorites", String(expected.favorites), `select count(*) from public.favorites where ${inRange("pet_id", ID_RANGES.pets)}`],
  ["count: adoption requests", String(expected.requests), `select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)}`],
  ...Object.entries(expected.requestsByStage).map(([s, c]) => [`count: requests ${s}`, String(c), `select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)} and stage = '${s}'`] as [string, string, string]),
  ["count: legacy review", String(expected.legacyReview), `select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)} and legacy_review`],
  ["count: disputed", String(expected.disputed), `select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)} and disputed`],
  ["count: escalated", String(expected.escalated), `select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)} and escalated`],
  ["count: closed", String(expected.closed), `select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)} and closed_at is not null`],
  ["count: timeline events", String(expected.timelineEvents), `select count(*) from public.adoption_stage_history where ${inRange("id", ID_RANGES.stageHistory)}`],
  ["count: handover reports", String(expected.handoverReports), `select count(*) from public.adoption_handover_reports where ${inRange("id", ID_RANGES.handoverReports)}`],
  ["count: follow-ups", String(expected.followUps), `select count(*) from public.adoption_follow_ups where ${inRange("id", ID_RANGES.followUps)}`],
  ["count: announcements", String(expected.announcements), `select count(*) from public.announcements where ${inRange("id", ID_RANGES.announcements)}`],
  ["count: notifications", String(expected.notifications), `select count(*) from public.notification_events where ${inRange("id", ID_RANGES.notifications)}`],
  ["count: unread notifications (personal)", String(expected.unreadNotifications), `select count(*) from public.notification_events where ${inRange("id", ID_RANGES.notifications)} and read_at is null and recipient_id is not null`],
];
const verifyCounts = rows.map(([name, value, sql]) => `  select ${q(name)}, ${q(value)}, (${sql})::text`).join("\n  union all\n");
writeFileSync(new URL("../verification/verify-demo-data.sql", outDir), `-- =========================================================
-- PawHome — ตรวจชุดข้อมูลทดสอบ ${DATASET_ID} (สร้างโดย generate-demo-seed.ts) · อ่านอย่างเดียว · ทุกแถวต้อง ok = true
-- รันหลัง database/seeds/001…010 · ใช้ได้ทั้ง PGlite และ Supabase Development
-- =========================================================
with checks(check_name, expected, actual) as (
${verifyCounts}

  -- ไม่มีข้อมูลกำพร้า (FK ทุกตัวชี้ไปแถวที่มีอยู่)
  union all select 'orphan: pets without owner profile', '0', (select count(*) from public.pets p left join public.profiles o on o.id = p.owner_id where o.id is null)::text
  union all select 'orphan: requests without pet/applicant', '0', (select count(*) from public.adoption_requests r left join public.pets p on p.id = r.pet_id left join public.profiles u on u.id = r.user_id where p.id is null or u.id is null)::text
  union all select 'orphan: timeline without request', '0', (select count(*) from public.adoption_stage_history h left join public.adoption_requests r on r.id = h.request_id where r.id is null)::text
  union all select 'orphan: reports without request', '0', (select count(*) from public.adoption_handover_reports h left join public.adoption_requests r on r.id = h.request_id where r.id is null)::text
  union all select 'orphan: notifications without target', '0', (select count(*) from public.notification_events n left join public.adoption_requests r on r.id = n.request_id left join public.announcements a on a.id = n.announcement_id where r.id is null and a.id is null)::text

  -- ช่องที่ต้องมีค่า / ข้อมูลสมมติ
  union all select 'required: pets name/description/province', '0', (select count(*) from public.pets where ${inRange("id", ID_RANGES.pets)} and (btrim(name) = '' or btrim(description) = '' or btrim(province) = ''))::text
  union all select 'fictional: demo phones start with 00000 (ไม่ใช่เบอร์จริง)', '0', (select count(*) from public.adoption_requests where ${inRange("id", ID_RANGES.adoptionRequests)} and phone not like '00000%')::text
  union all select 'fictional: demo owners use @pawhome.test', '0', (select count(*) from public.pets p join auth.users u on u.id = p.owner_id where ${inRange("p.id", ID_RANGES.pets)} and u.email not like 'demo-%@pawhome.test')::text
  union all select 'rule: no favorite on own pet', '0', (select count(*) from public.favorites f join public.pets p on p.id = f.pet_id where f.user_id = p.owner_id)::text
  union all select 'rule: no request on own pet', '0', (select count(*) from public.adoption_requests r join public.pets p on p.id = r.pet_id where r.user_id = p.owner_id)::text
  union all select 'rule: hidden/changes/review pets have no requests', '0', (select count(*) from public.adoption_requests r join public.pets p on p.id = r.pet_id where p.visibility <> 'VISIBLE')::text

  -- แจ้งเตือนเป็นของคนที่เกี่ยวข้องเท่านั้น
  union all select 'ownership: request notifications go to owner/applicant/admin queue', '0', (
    select count(*) from public.notification_events n join public.adoption_requests r on r.id = n.request_id join public.pets p on p.id = r.pet_id
    where n.recipient_id is not null and n.recipient_id not in (r.user_id, p.owner_id))::text
  union all select 'ownership: admin queue notifications are cron kinds only', '0', (
    select count(*) from public.notification_events where recipient_id is null and kind not in ('ADMIN_FOLLOW_UP', 'ESCALATION'))::text

  -- สิทธิ์ผู้ดูแลในชุดทดสอบ
  union all select 'admin: only demo accounts hold demo roles', '0', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like '%@pawhome.test' and u.email not like 'demo-0%')::text
  union all select 'admin: exactly one SUPER_ADMIN in dataset', '1', (select count(*) from public.admin_memberships m join auth.users u on u.id = m.user_id where u.email like 'demo-%@pawhome.test' and m.role = 'SUPER_ADMIN')::text
)
select check_name, expected, actual, expected = actual as ok
from checks
order by ok, check_name;
`);

console.log(`generated ${Object.keys(files).length} seed files → database/seeds/`);
console.log(JSON.stringify(expected, null, 2));
