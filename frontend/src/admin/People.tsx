import { useState } from "react";
import { Link } from "react-router";
import { useConfirmation } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { ago, formatDate, formatDateTime, petOf, petStatus, previewNow, usePreview, type Audit } from "./store";
import { Badge, Card, DataTable, Empty, matches, notify, PageHeader, SearchInput, Select, stageTone, Thumb, usePaged } from "./ui";
import { isTerminal, stageLabel } from "./workflow";

export function Users() {
  const data = usePreview();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "member" | "admin">("all");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmation();
  const filtered = data.users.filter((user) => (role === "all" || user.role === role) &&
    (status === "all" || (status === "suspended") === user.suspended) && matches(query, user.name, user.province));
  const { rows, pager, reset } = usePaged(filtered, 10);
  const selected = data.users.find((user) => user.id === selectedId);
  const posts = selected ? data.pets.filter((pet) => pet.ownerId === selected.id) : [];
  const requests = selected ? data.cases.filter((item) => item.applicantId === selected.id) : [];

  const toggle = (id: string) => {
    const user = data.users.find((entry) => entry.id === id)!;
    confirm({
      title: `${user.suspended ? "เปิดใช้งาน" : "ระงับ"}บัญชี ${user.name}`,
      description: user.suspended ? "ผู้ใช้จะกลับมาใช้งานได้ (ตัวอย่าง ไม่แก้บัญชีจริง)" : "ผู้ใช้จะเข้าสู่ระบบและส่งคำขอไม่ได้ (ตัวอย่าง ไม่แก้บัญชีจริง)",
      label: user.suspended ? "เปิดใช้งาน" : "ระงับบัญชี", danger: !user.suspended,
      action: () => {
        data.change(user.suspended ? "เปิดใช้งานบัญชี" : "ระงับบัญชี", user.name, "ผู้ใช้", (state) => ({
          users: state.users.map((entry) => (entry.id === id ? { ...entry, suspended: !entry.suspended } : entry)),
        }));
        notify(`${user.suspended ? "เปิดใช้งาน" : "ระงับ"}บัญชีจำลองแล้ว`);
      },
    });
  };

  return <>
    <PageHeader title="ผู้ใช้งาน">สมาชิกที่โพสต์หาบ้านและขอรับเลี้ยง · ข้อมูลจำลอง ไม่แสดงอีเมลหรือเบอร์โทรจริง</PageHeader>
    <Card>
      <div className="ad-filters">
        <div className="ad-field-wide"><SearchInput label="ค้นหาผู้ใช้" value={query} onChange={(value) => { setQuery(value); reset(); }} placeholder="ชื่อหรือจังหวัด" /></div>
        <Select label="บทบาท" value={role} onChange={(value) => { setRole(value); reset(); }} options={[["all", "ทุกบทบาท"], ["member", "สมาชิก"], ["admin", "ผู้ดูแล"]]} />
        <Select label="สถานะบัญชี" value={status} onChange={(value) => { setStatus(value); reset(); }} options={[["all", "ทุกสถานะ"], ["active", "ใช้งานอยู่"], ["suspended", "ถูกระงับ"]]} />
      </div>
      {filtered.length ? <DataTable label="ตารางผู้ใช้งาน" headers={["ผู้ใช้", "บทบาท", "จังหวัด", "โพสต์", "คำขอที่ยังเปิด", "สถานะ", "สมัครเมื่อ", ""]}>
        {rows.map((user) => <tr key={user.id}>
          <td><span className="ad-item"><span className="ad-avatar ad-avatar-soft" aria-hidden="true">{user.name.slice(0, 1)}</span><b>{user.name}</b></span></td>
          <td>{user.role === "admin" ? <Badge tone="solid">ผู้ดูแล</Badge> : "สมาชิก"}</td>
          <td>{user.province}</td>
          <td>{data.pets.filter((pet) => pet.ownerId === user.id).length}</td>
          <td>{data.cases.filter((item) => item.applicantId === user.id && !isTerminal(item.stage)).length}</td>
          <td><Badge tone={user.suspended ? "danger" : "success"}>{user.suspended ? "ถูกระงับ" : "ใช้งานอยู่"}</Badge></td>
          <td>{formatDate(user.joinedAt)}</td>
          <td><button type="button" className="ad-btn" aria-label={`ดูบัญชี ${user.name}`} onClick={() => setSelectedId(user.id)}>ดูรายละเอียด</button></td>
        </tr>)}
      </DataTable> : <Empty title="ไม่พบผู้ใช้ที่ตรงกับตัวกรอง" />}
      {pager}
    </Card>
    {selected && <Dialog title={selected.name} drawer onClose={() => setSelectedId(null)}>
      <div className="ad-stack">
        <div className="ad-row"><Badge tone={selected.suspended ? "danger" : "success"}>{selected.suspended ? "ถูกระงับ" : "ใช้งานอยู่"}</Badge>{selected.role === "admin" && <Badge tone="solid">ผู้ดูแล</Badge>}</div>
        <dl className="ad-details">
          <div><dt>จังหวัด</dt><dd>{selected.province}</dd></div>
          <div><dt>สมัครเมื่อ</dt><dd>{formatDate(selected.joinedAt)}</dd></div>
        </dl>
        <h3>โพสต์ ({posts.length})</h3>
        {posts.length ? <ul className="ad-list">{posts.map((pet) => <li key={pet.id}><span className="ad-item"><Thumb src={pet.imageUrl} name={pet.name} /><span className="ad-clamp">{pet.name}</span></span><Badge>{petStatus(data, pet)}</Badge></li>)}</ul> : <p className="ad-muted">ยังไม่มีโพสต์</p>}
        <h3>ประวัติคำขอรับเลี้ยง ({requests.length})</h3>
        {requests.length ? <ul className="ad-list">{requests.map((item) => <li key={item.id}><Link className="ad-btn-link" to={`/admin/adoptions/${item.id}`}>{petOf(data, item.petId)?.name} · {item.id}</Link><Badge tone={stageTone(item)}>{stageLabel[item.stage]}</Badge></li>)}</ul> : <p className="ad-muted">ยังไม่มีคำขอ</p>}
        {selected.role !== "admin" && <button type="button" className={`ad-btn ${selected.suspended ? "" : "ad-btn-danger"}`} onClick={() => toggle(selected.id)}>{selected.suspended ? "เปิดใช้งานบัญชี" : "ระงับบัญชี"}</button>}
      </div>
    </Dialog>}
    {dialog}
  </>;
}

const categories: Audit["category"][] = ["เคส", "สัตว์เลี้ยง", "ผู้ใช้", "ประกาศ", "ระบบ"];

export function AuditLogs() {
  const data = usePreview();
  const now = previewNow(data);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Audit["category"] | "all">("all");
  const [selected, setSelected] = useState<Audit | null>(null);
  const filtered = data.logs.filter((entry) => (category === "all" || entry.category === category) && matches(query, entry.actor, entry.action, entry.target, entry.note));
  const { rows, pager, reset } = usePaged(filtered, 12);

  return <>
    <PageHeader title="ประวัติกิจกรรม">ทุกการกระทำในพรีวิวถูกบันทึกที่นี่ (ข้อมูลจำลอง) · {data.logs.length} รายการ</PageHeader>
    <Card>
      <div className="ad-filters">
        <div className="ad-field-wide"><SearchInput label="ค้นหากิจกรรม" value={query} onChange={(value) => { setQuery(value); reset(); }} placeholder="ผู้ทำ การกระทำ หรือเป้าหมาย" /></div>
        <Select label="หมวด" value={category} onChange={(value) => { setCategory(value); reset(); }} options={[["all", "ทุกหมวด"], ...categories.map((name) => [name, name] as const)]} />
      </div>
      {filtered.length ? <DataTable label="ตารางประวัติกิจกรรม" headers={["เวลา", "ผู้ทำ", "การกระทำ", "เป้าหมาย", "หมวด", ""]}>
        {rows.map((entry) => <tr key={entry.id}>
          <td title={formatDateTime(entry.at)}>{ago(entry.at, now)}</td><td>{entry.actor}</td><td>{entry.action}</td>
          <td><span className="ad-name-cell">{entry.target}</span></td><td><Badge>{entry.category}</Badge></td>
          <td><button type="button" className="ad-btn" aria-label={`ดูกิจกรรม ${entry.action} ${entry.target}`} onClick={() => setSelected(entry)}>รายละเอียด</button></td>
        </tr>)}
      </DataTable> : <Empty title="ไม่พบกิจกรรม" />}
      {pager}
    </Card>
    {selected && <Dialog title={selected.action} drawer onClose={() => setSelected(null)}>
      <dl className="ad-details">
        <div><dt>ผู้ทำ</dt><dd>{selected.actor}</dd></div><div><dt>หมวด</dt><dd>{selected.category}</dd></div>
        <div><dt>เป้าหมาย</dt><dd>{selected.target}</dd></div><div><dt>เวลา</dt><dd>{formatDateTime(selected.at)}</dd></div>
      </dl>
      {selected.note && <p className="ad-pre ad-mt">“{selected.note}”</p>}
      {selected.target.startsWith("AD-") && <Link className="ad-btn ad-mt" to={`/admin/adoptions/${selected.target}`}>เปิดเคส {selected.target}</Link>}
    </Dialog>}
  </>;
}
