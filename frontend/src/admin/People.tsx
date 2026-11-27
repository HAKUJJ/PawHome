import { useState } from "react";
import { Link } from "react-router";
import { useConfirmation } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { adminApi } from "./api";
import { mutateAdmin } from "./real";
import { formatDate, petOf, petStatus, usePreview } from "./store";
import { Badge, Card, DataTable, Empty, Field, matches, PageHeader, SearchInput, Select, stageTone, Thumb, usePaged } from "./ui";
import { isTerminal, stageLabel } from "./workflow";

export function Users() {
  const data = usePreview();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "member" | "admin">("all");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmation();
  const filtered = data.users.filter((user) => (role === "all" || user.role === role) &&
    (status === "all" || (status === "suspended") === user.suspended) && matches(query, user.name, user.province));
  const { rows, pager, reset } = usePaged(filtered, 10);
  const selected = data.users.find((user) => user.id === selectedId);
  const posts = selected ? data.pets.filter((pet) => pet.ownerId === selected.id) : [];
  const requests = selected ? data.cases.filter((item) => item.applicantId === selected.id) : [];

  const toggle = (id: string) => {
    const user = data.users.find((entry) => entry.id === id)!;
    if (!user.suspended) { setSuspending(id); return; }
    confirm({
      title: `เปิดใช้งานบัญชี ${user.name}`, description: "ผู้ใช้จะกลับมาเข้าสู่ระบบและส่งคำขอได้", label: "เปิดใช้งาน",
      action: () => void mutateAdmin(() => adminApi.unsuspend(id), "เปิดใช้งานบัญชีแล้ว"),
    });
  };

  return <>
    <PageHeader title="ผู้ใช้งาน">สมาชิกที่โพสต์หาบ้านและขอรับเลี้ยง · ไม่แสดงอีเมลหรือเบอร์โทร</PageHeader>
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
    {suspending && <SuspendDialog name={data.users.find((u) => u.id === suspending)?.name ?? ""} onClose={() => setSuspending(null)}
      onSave={(reason) => void mutateAdmin(() => adminApi.suspend(suspending, reason), "ระงับบัญชีแล้ว").then((ok) => ok && setSuspending(null))} />}
    {dialog}
  </>;
}

function SuspendDialog({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <Dialog title={`ระงับบัญชี ${name}`} onClose={onClose}>
    <form className="ad-stack" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onSave(reason.trim()); }}>
      <p className="ad-muted">ผู้ใช้จะเข้าใช้งานและส่งคำขอไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง · เหตุผลถูกบันทึกใน Audit Log</p>
      <Field label="เหตุผลที่ระงับ (อย่างน้อย 5 ตัวอักษร)"><textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <div className="ad-row">
        <button type="button" className="ad-btn" onClick={onClose}>กลับ</button>
        <button type="submit" className="ad-btn ad-btn-danger" disabled={reason.trim().length < 5}>ระงับบัญชี</button>
      </div>
    </form>
  </Dialog>;
}

