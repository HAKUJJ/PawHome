import { useState } from "react";
import { useSearchParams } from "react-router";
import { useConfirmation } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { formatAge, sexLabel, speciesLabel, type Species } from "../types/pet";
import { formatDate, petStatus, usePreview, userName, type PreviewPet, type Visibility } from "./store";
import { Badge, DataTable, Empty, Field, matches, notify, PageHeader, SearchInput, Select, Thumb, usePaged, type Tone, Card } from "./ui";
import { isTerminal } from "./workflow";

const statusFilter = [["all", "ทุกสถานะ"], ["review", "รอตรวจสอบ"], ["changes", "ส่งกลับให้แก้ไข"], ["visible", "แสดงอยู่"], ["hidden", "ซ่อนอยู่"]] as const;
const sorts = [["new", "ใหม่ล่าสุด"], ["old", "เก่าสุด"], ["name", "ชื่อ ก–ฮ"], ["age", "อายุน้อย → มาก"]] as const;
const statusTone: Record<string, Tone> = { รอตรวจสอบ: "warning", ส่งกลับให้แก้ไข: "warning", ซ่อนอยู่: "neutral", ได้บ้านแล้ว: "success", มีคำขอรับเลี้ยง: "navy", รอบ้าน: "navy" };
// เหตุผลสำเร็จรูป (เลือกแล้วแก้ต่อได้)
const reasons = ["รูปไม่ชัดหรือไม่ใช่รูปน้องตัวจริง", "ข้อมูลอายุ/เพศ/วัคซีนไม่ครบ", "ช่วยเพิ่มรายละเอียดนิสัยและการดูแล"];


export function Pets() {
  const data = usePreview();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "all") as (typeof statusFilter)[number][0];
  const [query, setQuery] = useState("");
  const [species, setSpecies] = useState<Species | "all">("all");
  const [province, setProvince] = useState("all");
  const [sort, setSort] = useState<(typeof sorts)[number][0]>("new");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [review, setReview] = useState<PreviewPet | null>(null);
  const { confirm, dialog } = useConfirmation();

  const provinces = [...new Set(data.pets.map((pet) => pet.province))].sort((a, b) => a.localeCompare(b, "th"));
  const filtered = data.pets
    .filter((pet) => (status === "all" || pet.visibility === status) && (species === "all" || pet.species === species) &&
      (province === "all" || pet.province === province) && matches(query, pet.name, pet.breed, userName(data, pet.ownerId)))
    .sort((a, b) => sort === "new" ? b.createdAt - a.createdAt : sort === "old" ? a.createdAt - b.createdAt
      : sort === "name" ? a.name.localeCompare(b.name, "th") : a.ageMonths - b.ageMonths);
  const { rows, pager, reset } = usePaged(filtered, 8);
  const selected = data.pets.find((pet) => pet.id === selectedId);
  const filter = <T,>(set: (value: T) => void) => (value: T) => { set(value); reset(); };

  const setVisibility = (pet: PreviewPet, visibility: Visibility, action: string, note?: string) => {
    data.change(action, pet.name, "สัตว์เลี้ยง", (state) => ({
      pets: state.pets.map((entry) => (entry.id === pet.id ? { ...entry, visibility, reviewNote: note } : entry)),
    }), note);
    notify(`${action}แล้ว (ข้อมูลจำลอง)`);
  };
  const remove = (pet: PreviewPet) => {
    const open = data.cases.some((item) => item.petId === pet.id && !isTerminal(item.stage));
    confirm({
      title: `ลบโพสต์ ${pet.name}`,
      description: open ? "น้องตัวนี้มีคำขอรับเลี้ยงที่ยังเปิดอยู่ คำขอเหล่านั้นจะถูกลบไปด้วย (เฉพาะข้อมูลจำลอง)" : "ลบโพสต์ออกจากข้อมูลจำลอง (ไม่มีผลกับเว็บไซต์จริง)",
      label: "ลบโพสต์", danger: true,
      action: () => {
        data.change("ลบโพสต์", pet.name, "สัตว์เลี้ยง", (state) => ({
          pets: state.pets.filter((entry) => entry.id !== pet.id), cases: state.cases.filter((item) => item.petId !== pet.id),
        }));
        setSelectedId(null);
        notify("ลบโพสต์จำลองแล้ว");
      },
    });
  };

  return <>
    <PageHeader title="จัดการสัตว์เลี้ยง">ตรวจโพสต์ใหม่ก่อนเผยแพร่ ส่งกลับให้แก้ไขพร้อมเหตุผล และซ่อนโพสต์ที่ไม่เหมาะสม · {data.pets.length} โพสต์</PageHeader>
    <Card>
      <div className="ad-filters">
        <div className="ad-field-wide"><SearchInput label="ค้นหาโพสต์" value={query} onChange={filter(setQuery)} placeholder="ชื่อน้อง สายพันธุ์ หรือเจ้าของ" /></div>
        <Select label="ชนิด" value={species} onChange={filter(setSpecies)} options={[["all", "ทุกชนิด"], ...Object.entries(speciesLabel) as [Species, string][]]} />
        <Select label="สถานะ" value={status} onChange={(value) => { setParams(value === "all" ? {} : { status: value }); reset(); }} options={statusFilter} />
        <Select label="จังหวัด" value={province} onChange={filter(setProvince)} options={[["all", "ทุกจังหวัด"], ...provinces.map((name) => [name, name] as const)]} />
        <Select label="เรียงตาม" value={sort} onChange={setSort} options={sorts} />
      </div>
      <p className="ad-muted ad-small" role="status">พบ {filtered.length} โพสต์</p>
      {filtered.length ? <DataTable label="ตารางโพสต์สัตว์เลี้ยง" headers={["รูป", "ชื่อ", "ชนิด", "อายุ", "จังหวัด", "เจ้าของ", "สถานะ", "โพสต์เมื่อ", "จัดการ"]}>
        {rows.map((pet) => {
          const label = petStatus(data, pet);
          return <tr key={pet.id}>
            <td><Thumb src={pet.imageUrl} name={pet.name} /></td>
            <td><span className="ad-name-cell" title={pet.name}>{pet.name}</span></td>
            <td>{speciesLabel[pet.species]}</td><td>{formatAge(pet.ageMonths)}</td><td>{pet.province}</td><td>{userName(data, pet.ownerId)}</td>
            <td><Badge tone={statusTone[label]}>{label}</Badge></td><td>{formatDate(pet.createdAt)}</td>
            <td><button type="button" className="ad-btn" aria-label={`ดูโพสต์ ${pet.name}`} onClick={() => setSelectedId(pet.id)}>ดู / จัดการ</button></td>
          </tr>;
        })}
      </DataTable> : <Empty title="ไม่พบโพสต์ที่ตรงกับตัวกรอง" />}
      {pager}
    </Card>

    {selected && <Dialog title={selected.name} drawer onClose={() => setSelectedId(null)}>
      <div className="ad-stack">
        <Thumb src={selected.imageUrl} name={selected.name} className="ad-drawer-photo" />
        <div className="ad-row"><Badge tone={statusTone[petStatus(data, selected)]}>{petStatus(data, selected)}</Badge><Badge tone="solid">{selected.province}</Badge></div>
        <dl className="ad-details">
          <div><dt>ชนิด / สายพันธุ์</dt><dd>{speciesLabel[selected.species]}{selected.breed && ` · ${selected.breed}`}</dd></div>
          <div><dt>อายุ · เพศ</dt><dd>{formatAge(selected.ageMonths)} · {sexLabel[selected.sex]}</dd></div>
          <div><dt>วัคซีน</dt><dd>{selected.vaccinated ? "ฉีดแล้ว" : "ยังไม่ฉีด"}</dd></div>
          <div><dt>ทำหมัน</dt><dd>{selected.sterilized ? "ทำแล้ว" : "ยังไม่ทำ"}</dd></div>
          <div><dt>เจ้าของ</dt><dd>{userName(data, selected.ownerId)}</dd></div>
          <div><dt>คำขอทั้งหมด</dt><dd>{data.cases.filter((item) => item.petId === selected.id).length} คำขอ</dd></div>
        </dl>
        <p className={selected.description ? "ad-pre" : "ad-muted"}>{selected.description || "ผู้โพสต์ยังไม่ได้เขียนรายละเอียด"}</p>
        {selected.visibility === "changes" && selected.reviewNote && <div className="ad-callout ad-callout-warning"><b>สิ่งที่ขอให้แก้ไข</b>{selected.reviewNote}</div>}
        {selected.visibility !== "visible" && <>
          <h3>ผลการตรวจโพสต์</h3>
          <div className="ad-row">
            <button type="button" className="ad-btn ad-btn-success" onClick={() => setVisibility(selected, "visible", "อนุมัติโพสต์")}>✓ อนุมัติ</button>
            {selected.visibility !== "changes" && <button type="button" className="ad-btn ad-btn-warning" onClick={() => setReview(selected)}>↩ ส่งกลับไปแก้ไข</button>}
          </div>
        </>}
        <h3>จัดการโพสต์</h3>
        <div className="ad-row">
          {selected.visibility === "visible" && <button type="button" className="ad-btn" onClick={() => confirm({ title: `ซ่อนโพสต์ ${selected.name}`, description: "โพสต์จะไม่แสดงต่อผู้เข้าชมจนกว่าจะอนุมัติอีกครั้ง (ตัวอย่าง)", label: "ซ่อนโพสต์", action: () => setVisibility(selected, "hidden", "ซ่อนโพสต์") })}>ซ่อนโพสต์</button>}
          <button type="button" className="ad-btn ad-btn-danger" onClick={() => remove(selected)}>ลบโพสต์</button>
        </div>
      </div>
    </Dialog>}
    {review && <ReasonDialog pet={review} onClose={() => setReview(null)} onSave={(note) => {
      setVisibility(review, "changes", "ส่งโพสต์กลับไปแก้ไข", note);
      setReview(null);
    }} />}
    {dialog}
  </>;
}

function ReasonDialog({ pet, onClose, onSave }: { pet: PreviewPet; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  return <Dialog title={`ส่งกลับไปแก้ไข · ${pet.name.slice(0, 40)}`} onClose={onClose}>
    <form className="ad-stack" onSubmit={(event) => { event.preventDefault(); if (note.trim()) onSave(note.trim()); }}>
      <p className="ad-muted">เจ้าของจะเห็นสิ่งที่ต้องแก้ แล้วส่งกลับมาให้ตรวจอีกครั้ง (ข้อมูลจำลอง ไม่ส่งข้อความจริง)</p>
      <div className="ad-chips" role="group" aria-label="เหตุผลสำเร็จรูป">
        {reasons.map((text) => <button key={text} type="button" className="ad-chip" onClick={() => setNote((current) => (current ? `${current}
${text}` : text))}>+ {text}</button>)}
      </div>
      <Field label="สิ่งที่ต้องแก้ไข"><textarea required rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <div className="ad-row">
        <button type="button" className="ad-btn" onClick={onClose}>กลับ</button>
        <button type="submit" className="ad-btn ad-btn-warning" disabled={!note.trim()}>ส่งกลับไปแก้ไข</button>
      </div>
    </form>
  </Dialog>;
}
