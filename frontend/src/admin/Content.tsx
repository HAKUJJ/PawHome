import { useState, type FormEvent } from "react";
import { useConfirmation } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { adminApi, fromAnnouncement } from "./api";
import { mutateAdmin } from "./real";
import { formatDate, usePreview, type Announcement } from "./store";
import { Badge, Card, Chips, Empty, Field, Icon, PageHeader, Select } from "./ui";

const blank: Omit<Announcement, "id" | "order"> = { title: "", category: "ประชาสัมพันธ์", description: "", date: "", time: "", location: "", contact: "", cta: "ดูรายละเอียด", destination: "/", published: false };

export function Announcements() {
  const data = usePreview();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [preview, setPreview] = useState<Announcement | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const { confirm, dialog } = useConfirmation();
  const list = [...data.announcements].sort((a, b) => a.order - b.order);
  const shown = list.filter((entry) => filter === "all" || (filter === "published") === entry.published);

  const save = (entry: Announcement) => {
    const exists = data.announcements.some((item) => item.id === entry.id);
    void mutateAdmin(() => (exists ? adminApi.updateAnnouncement(entry.id, fromAnnouncement(entry)) : adminApi.createAnnouncement(entry)),
      exists ? "บันทึกประกาศแล้ว" : "สร้างประกาศแล้ว").then((ok) => ok && setEditing(null));
  };
  const togglePublish = (entry: Announcement) => {
    void mutateAdmin(() => adminApi.updateAnnouncement(entry.id, { status: entry.published ? "DRAFT" : "PUBLISHED" }), entry.published ? "ย้ายเป็นฉบับร่างแล้ว" : "เผยแพร่ประกาศแล้ว");
  };
  const move = (index: number, direction: -1 | 1) => {
    const other = list[index + direction];
    const entry = list[index];
    // ลำดับเดิมอาจซ้ำกัน → ใช้ตำแหน่งในรายการเป็นลำดับใหม่ของทั้งสองรายการ
    void mutateAdmin(async () => {
      await adminApi.updateAnnouncement(entry.id, { displayOrder: index + direction });
      await adminApi.updateAnnouncement(other.id, { displayOrder: index });
    }, "จัดลำดับประกาศแล้ว");
  };

  return <>
    <PageHeader title="ประชาสัมพันธ์" action={<button type="button" className="ad-btn ad-btn-primary" onClick={() => setEditing("new")}><Icon name="plus" />สร้างประกาศ</button>}>
      ประกาศที่เผยแพร่แล้วแสดงบนหน้าแรกผ่าน API สาธารณะ
    </PageHeader>
    <Chips label="สถานะประกาศ" value={filter} onChange={setFilter} options={[
      ["all", "ทั้งหมด", list.length], ["published", "เผยแพร่", list.filter((entry) => entry.published).length], ["draft", "ฉบับร่าง", list.filter((entry) => !entry.published).length],
    ]} />
    {shown.length ? <ol className="ad-stack">{shown.map((entry) => {
      const index = list.indexOf(entry);
      return <li key={entry.id} className="ad-card">
        <div className="ad-card-head">
          <div><p className="ad-muted ad-small">ลำดับ {index + 1} · {entry.category}</p><h2>{entry.title}</h2><p>{entry.description}</p></div>
          <Badge tone={entry.published ? "success" : "neutral"}>{entry.published ? "เผยแพร่" : "ฉบับร่าง"}</Badge>
        </div>
        <p className="ad-muted ad-small">{[entry.date && formatDate(new Date(`${entry.date}T12:00:00+07:00`).getTime()), entry.time, entry.location].filter(Boolean).join(" · ") || "ไม่มีวันเวลาและสถานที่"}</p>
        <div className="ad-row ad-mt">
          <button type="button" className="ad-btn" onClick={() => setPreview(entry)}>ดูตัวอย่าง</button>
          <button type="button" className="ad-btn" onClick={() => setEditing(entry)}>แก้ไข</button>
          <button type="button" className={`ad-btn ${entry.published ? "" : "ad-btn-primary"}`} onClick={() => togglePublish(entry)}>{entry.published ? "ยกเลิกการเผยแพร่" : "เผยแพร่"}</button>
          <button type="button" className="ad-btn" disabled={index === 0} aria-label={`เลื่อน ${entry.title} ขึ้น`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="ad-btn" disabled={index === list.length - 1} aria-label={`เลื่อน ${entry.title} ลง`} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="ad-btn ad-btn-danger" onClick={() => confirm({
            title: `ลบประกาศ "${entry.title}"`, description: "ลบได้เฉพาะฉบับร่าง · ประกาศที่เผยแพร่อยู่ต้องยกเลิกการเผยแพร่ก่อน", label: "ลบประกาศ", danger: true,
            action: () => void mutateAdmin(() => adminApi.deleteAnnouncement(entry.id), "ลบประกาศแล้ว"),
          })}>ลบ</button>
        </div>
      </li>;
    })}</ol> : <Card><Empty title="ไม่มีประกาศในหมวดนี้" /></Card>}

    {editing && <Dialog title={editing === "new" ? "สร้างประกาศ" : `แก้ไข ${editing.title}`} onClose={() => setEditing(null)}>
      <AnnouncementForm initial={editing === "new" ? { ...blank, id: `A${crypto.randomUUID().slice(0, 6)}`, order: list.length + 1 } : editing} onSave={save} onPreview={setPreview} />
    </Dialog>}
    {preview && <Dialog title="ตัวอย่างการ์ดบนหน้าแรก" onClose={() => setPreview(null)}>
      <article className="ad-promo-preview">
        <p className="ad-small">{preview.category}{preview.published ? "" : " · ฉบับร่าง"}</p>
        <h3>{preview.title || "(ยังไม่มีชื่อ)"}</h3>
        <p>{preview.description || "(ยังไม่มีรายละเอียด)"}</p>
        {(preview.date || preview.location) && <p className="ad-small">{[preview.date, preview.time, preview.location].filter(Boolean).join(" · ")}</p>}
        <span className="ad-promo-cta">{preview.cta || "ดูรายละเอียด"} →</span>
      </article>
      <p className="ad-muted ad-small ad-mt">ปุ่มพาไปที่ {preview.destination || "/"} · ติดต่อ: {preview.contact || "–"}</p>
    </Dialog>}
    {dialog}
  </>;
}

function AnnouncementForm({ initial, onSave, onPreview }: { initial: Announcement; onSave: (entry: Announcement) => void; onPreview: (entry: Announcement) => void }) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof Announcement>(key: K, value: Announcement[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ ...form, title: form.title.trim(), destination: form.destination.trim() || "/" }); };
  return <form className="ad-stack" onSubmit={submit}>
    <Select label="หมวด" value={form.category} onChange={(value) => set("category", value)} options={["ประชาสัมพันธ์", "ร่วมช่วยเหลือ", "ผู้สนับสนุน", "กิจกรรม"].map((name) => [name, name] as const)} />
    <Field label="ชื่อประกาศ"><input required maxLength={80} value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
    <Field label="รายละเอียด"><textarea required rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} /></Field>
    <div className="ad-filters">
      <Field label="วันที่"><input type="date" value={form.date} onChange={(event) => set("date", event.target.value)} /></Field>
      <Field label="เวลา"><input value={form.time} placeholder="09:00–16:00" onChange={(event) => set("time", event.target.value)} /></Field>
    </div>
    <Field label="สถานที่"><input value={form.location} onChange={(event) => set("location", event.target.value)} /></Field>
    <Field label="ช่องทางติดต่อ"><input value={form.contact} onChange={(event) => set("contact", event.target.value)} /></Field>
    <div className="ad-filters">
      <Field label="ข้อความปุ่ม"><input required value={form.cta} onChange={(event) => set("cta", event.target.value)} /></Field>
      <Field label="ปลายทางปุ่ม (path ในเว็บ)"><input required pattern="/.*" title="ขึ้นต้นด้วย /" value={form.destination} onChange={(event) => set("destination", event.target.value)} /></Field>
    </div>
    <label className="ad-check"><input type="checkbox" checked={form.published} onChange={(event) => set("published", event.target.checked)} />เผยแพร่ทันที (ไม่เลือก = ฉบับร่าง)</label>
    <div className="ad-row"><button type="button" className="ad-btn" onClick={() => onPreview(form)}>ดูตัวอย่างก่อนบันทึก</button><button type="submit" className="ad-btn ad-btn-primary">บันทึก</button></div>
  </form>;
}
