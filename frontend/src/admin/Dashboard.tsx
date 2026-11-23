import { Link } from "react-router";
import { speciesLabel } from "../types/pet";
import { ago, petOf, petStatus, previewNow, usePreview, userName, type PreviewData } from "./store";
import { Badge, byUrgency, Card, CaseRow, Empty, Icon, PageHeader, StatCard, stageTone, Thumb } from "./ui";
import { followUp, HOUR, isTerminal, stageLabel } from "./workflow";

const WEEK = 7 * 24 * HOUR;
export const handoverStages = ["ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED"];

// ตัวเลขทั้งหมดของแดชบอร์ด คำนวณจากข้อมูลชุดเดียวกับหน้ารายการและรายงาน
export function metrics(data: PreviewData) {
  const now = previewNow(data);
  const open = data.cases.filter((item) => !isTerminal(item.stage) && !item.closed);
  return {
    pending: open.filter((item) => item.stage === "PENDING").length,
    overdue: open.filter((item) => followUp(item, now).overdue).length,
    handover: open.filter((item) => handoverStages.includes(item.stage)).length,
    completed: data.cases.filter((item) => item.stage === "COMPLETED").length,
    required: open.filter((item) => followUp(item, now).required).length,
    pets: data.pets.length,
    users: data.users.length,
    review: data.pets.filter((pet) => pet.visibility === "review").length,
    published: data.announcements.filter((entry) => entry.published).length,
  };
}

// คำขอใหม่ / รับเลี้ยงสำเร็จ รายสัปดาห์ ย้อนหลัง n สัปดาห์ (เก่า → ใหม่)
export function weekly(data: PreviewData, weeks = 8) {
  const now = previewNow(data);
  return Array.from({ length: weeks }, (_, index) => {
    const end = now - (weeks - 1 - index) * WEEK;
    const inWeek = (time?: number) => time !== undefined && time > end - WEEK && time <= end;
    return {
      label: new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(end - WEEK + 1),
      requests: data.cases.filter((item) => inWeek(item.createdAt)).length,
      completed: data.cases.filter((item) => inWeek(item.completedAt)).length,
    };
  });
}

export function Dashboard() {
  const data = usePreview();
  const now = previewNow(data);
  const stats = metrics(data);
  const queue = byUrgency(data, data.cases.filter((item) => !isTerminal(item.stage) && !item.closed)).slice(0, 8);
  const trend = weekly(data);
  const peak = Math.max(1, ...trend.map((entry) => entry.requests));
  const reviewPets = data.pets.filter((pet) => pet.visibility === "review").sort((a, b) => b.createdAt - a.createdAt);
  const recentPets = [...data.pets].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const recentCases = [...data.cases].sort((a, b) => Math.max(...b.timeline.map((e) => e.at)) - Math.max(...a.timeline.map((e) => e.at))).slice(0, 4);

  return <>
    <PageHeader title="ภาพรวม" action={<button type="button" className="ad-btn" onClick={() => usePreview.setState({})}><Icon name="refresh" />รีเฟรช</button>}>
      เคสรับเลี้ยงที่ต้องติดตาม ประกาศรอตรวจ และกิจกรรมล่าสุด
    </PageHeader>

    <Card focus title="เคสรับเลี้ยงที่ต้องติดตาม" icon="bell"
      subtitle="เรียงตามความเร่งด่วน · เจ้าของไม่ตอบ 24 / 48 / 72 ชม. = เตือน / ติดตาม / ด่วน (ค่าตัวอย่าง)"
      action={<Link to="/admin/adoptions?filter=required" className="ad-btn ad-btn-primary">ดูเคสที่ต้องติดตาม ({stats.required}) →</Link>}>
      <div className="ad-stats">
        {/* เรียงตามความสำคัญ: ต้องลงมือก่อน → รอ → กำลังดำเนินการ → สำเร็จ */}
        <StatCard tone="danger" label="เกินเวลาตาม Policy" value={stats.overdue} note="เงียบเกิน 48 ชม. · Admin ต้องติดตาม" icon="history" to="/admin/adoptions?filter=overdue" />
        <StatCard tone="warning" label="รอเจ้าของตอบกลับ" value={stats.pending} note="คำขอที่ยังไม่มีคำตอบ" icon="clipboard" to="/admin/adoptions?stage=PENDING" />
        <StatCard tone="navy" label="รอส่งมอบ / รอยืนยัน" value={stats.handover} note="ตอบรับแล้ว ยังไม่ปิดเคส" icon="handover" to="/admin/adoptions?filter=handover" />
        <StatCard tone="success" label="รับเลี้ยงสำเร็จ" value={stats.completed} note="ยืนยันส่งมอบครบแล้ว" icon="check" to="/admin/adoptions?stage=COMPLETED" />
      </div>
      {queue.length ? <ul className="ad-cases ad-mt">{queue.map(({ item }) => <CaseRow key={item.id} data={data} item={item} />)}</ul>
        : <Empty title="ไม่มีเคสที่ต้องติดตาม" />}
    </Card>

    <div className="ad-grid-2">
      <Card title="ประกาศหาบ้านรอตรวจ" action={<Link className="ad-btn-link" to="/admin/pets?status=review">ดูทั้งหมด ({stats.review}) →</Link>}>
        {reviewPets.length ? <ul className="ad-list">{reviewPets.slice(0, 4).map((pet) => <li key={pet.id}>
          <div className="ad-item"><Thumb src={pet.imageUrl} name={pet.name} /><div>
            <p className="ad-clamp"><b>{pet.name}</b></p>
            <p className="ad-muted ad-small ad-clamp">{speciesLabel[pet.species]} · {pet.province} · โดย {userName(data, pet.ownerId)} · {ago(pet.createdAt, now)}</p>
          </div></div>
          <Badge tone="warning">รอตรวจ</Badge>
        </li>)}</ul> : <Empty title="ไม่มีประกาศรอตรวจ" />}
      </Card>
      {data.preferences.trends ? <Card title="แนวโน้มคำขอรับเลี้ยง" subtitle="คำขอรับเลี้ยงรายสัปดาห์ (8 สัปดาห์ล่าสุด)"
      action={<Link className="ad-btn-link" to="/admin/reports">รายงานเต็ม →</Link>}>
      <div className="ad-columns" role="img" aria-label={`คำขอรายสัปดาห์ ${trend.map((entry) => `${entry.label} ${entry.requests} คำขอ`).join(", ")}`}>
        {trend.map((entry, index) => <div key={index}><b>{entry.requests}</b><i style={{ height: `${Math.max(3, (entry.requests / peak) * 100)}%` }} /><span>{entry.label}</span></div>)}
      </div>
      <p className="ad-muted ad-small ad-mt">รวม {trend.reduce((sum, entry) => sum + entry.requests, 0)} คำขอ · รับเลี้ยงสำเร็จ {trend.reduce((sum, entry) => sum + entry.completed, 0)} เคสในช่วงเดียวกัน</p>
    </Card> : <Card title="แนวโน้มคำขอรับเลี้ยง"><p className="ad-muted">ปิดการแสดงกราฟไว้ในหน้าตั้งค่า</p></Card>}
    </div>

    <div className="ad-stats" aria-label="สถานะระบบ" role="group">
      <StatCard tone="warning" label="โพสต์ที่ต้องตรวจสอบ" value={stats.review} icon="clipboard" to="/admin/pets?status=review" />
      <StatCard label="สัตว์ทั้งหมด" value={stats.pets} icon="paw" to="/admin/pets" />
      <StatCard label="ผู้ใช้งาน" value={stats.users} icon="users" to="/admin/users" />
      <StatCard label="ประกาศที่เผยแพร่" value={stats.published} icon="megaphone" to="/admin/announcements" />
    </div>

    {data.preferences.showQuickActions && <Card title="ทางลัด">
      <div className="ad-row">
        <Link className="ad-btn ad-btn-primary" to="/admin/adoptions?filter=overdue">ติดตามเคสเกินเวลา</Link>
        <Link className="ad-btn" to="/admin/pets?status=review">ตรวจโพสต์ใหม่ ({stats.review})</Link>
        <Link className="ad-btn" to="/admin/announcements">จัดการประกาศ</Link>
        <Link className="ad-btn" to="/admin/workflow-preview">ทดลองขั้นตอนรับเลี้ยง</Link>
      </div>
    </Card>}

    <div className="ad-grid-2">
      <Card title="โพสต์สัตว์ล่าสุด" action={<Link className="ad-btn-link" to="/admin/pets">ดูทั้งหมด →</Link>}>
        <ul className="ad-list">{recentPets.map((pet) => <li key={pet.id}>
          <div className="ad-item"><Thumb src={pet.imageUrl} name={pet.name} /><div>
            <p className="ad-clamp"><b>{pet.name}</b></p>
            <p className="ad-muted ad-small ad-clamp">{speciesLabel[pet.species]} · {pet.province} · โดย {userName(data, pet.ownerId)} · {ago(pet.createdAt, now)}</p>
          </div></div>
          <Badge tone={pet.visibility === "review" ? "warning" : pet.visibility === "hidden" ? "neutral" : "navy"}>{petStatus(data, pet)}</Badge>
        </li>)}</ul>
      </Card>
      <Card title="ความเคลื่อนไหวคำขอรับเลี้ยง" action={<Link className="ad-btn-link" to="/admin/adoptions">ดูทั้งหมด →</Link>}>
        <ul className="ad-list">{recentCases.map((item) => {
          const last = item.timeline.at(-1)!;
          return <li key={item.id}>
            <div className="ad-min0"><Link className="ad-btn-link" to={`/admin/adoptions/${item.id}`}>{petOf(data, item.petId)?.name} · {item.id}</Link>
              <p className="ad-muted ad-small">{last.label} · {ago(last.at, now)}</p></div>
            <Badge tone={stageTone(item)}>{stageLabel[item.stage]}</Badge>
          </li>;
        })}</ul>
      </Card>
      <Card title="กิจกรรมผู้ใช้ล่าสุด" action={<Link className="ad-btn-link" to="/admin/audit-logs">ดูประวัติ →</Link>}>
        <ul className="ad-list">{data.logs.slice(0, 5).map((entry) => <li key={entry.id}>
          <span className="ad-min0"><b>{entry.actor}</b> · {entry.action} <span className="ad-muted">({entry.target.length > 24 ? `${entry.target.slice(0, 24)}…` : entry.target})</span></span>
          <span className="ad-muted ad-small">{ago(entry.at, now)}</span>
        </li>)}</ul>
      </Card>
      <Card title="ประชาสัมพันธ์" action={<Link className="ad-btn-link" to="/admin/announcements">จัดการ →</Link>}>
        <ul className="ad-list">{[...data.announcements].sort((a, b) => a.order - b.order).map((entry) => <li key={entry.id}>
          <span className="ad-min0">{entry.title}</span><Badge tone={entry.published ? "success" : "neutral"}>{entry.published ? "เผยแพร่" : "ฉบับร่าง"}</Badge>
        </li>)}</ul>
      </Card>
    </div>

  </>;
}
