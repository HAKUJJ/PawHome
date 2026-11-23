import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useConfirmation } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { handoverStages } from "./Dashboard";
import { formatDateTime, idleText, ownerOf, petOf, previewNow, usePreview, userName } from "./store";
import { Badge, byUrgency, Card, CaseRow, Chips, Empty, Field, insight, matches, notify, PageHeader, priorityChip, SearchInput, Select, stageTone, Thumb, usePaged } from "./ui";
import {
  caseSteps, currentStep, followUp, handoverLabel, isTerminal, partyLabel, priorityLabel, reportsMatch, stageLabel,
  type AdoptionCase, type CaseAction, type Party, type Priority, type Stage,
} from "./workflow";

const quick = {
  all: "ทั้งหมด",
  required: "ต้องติดตาม",
  overdue: "เกินเวลา (48 ชม.+)",
  flagged: "Admin ตั้งธง",
  disputed: "มีข้อพิพาท",
  handover: "รอส่งมอบ / ยืนยัน",
} as const;
type Quick = keyof typeof quick;

export function AdoptionList() {
  const data = usePreview();
  const now = previewNow(data);
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") ?? "all") as Quick;
  const stage = (params.get("stage") ?? "all") as Stage | "all";
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [sort, setSort] = useState<"urgency" | "idle" | "newest" | "oldest">("urgency");
  const [query, setQuery] = useState("");
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key); else next.set(key, value);
    setParams(next);
  };
  const test = (item: AdoptionCase, key: Quick) => {
    const policy = followUp(item, now);
    const open = !isTerminal(item.stage) && !item.closed;
    return key === "all" || (key === "required" && open && policy.required) || (key === "overdue" && policy.overdue) ||
      (key === "flagged" && open && item.flagged) || (key === "disputed" && item.disputed) || (key === "handover" && open && handoverStages.includes(item.stage));
  };
  const filtered = byUrgency(data, data.cases.filter((item) => {
    const pet = petOf(data, item.petId);
    return test(item, filter) && (stage === "all" || item.stage === stage) && (priority === "all" || followUp(item, now).priority === priority) &&
      matches(query, item.id, pet?.name, userName(data, item.applicantId), userName(data, ownerOf(data, item)));
  }));
  if (sort === "idle") filtered.sort((a, b) => b.policy.hours - a.policy.hours);
  if (sort === "newest" || sort === "oldest") filtered.sort((a, b) => (sort === "newest" ? 1 : -1) * (b.item.createdAt - a.item.createdAt));
  const { rows, pager, reset } = usePaged(filtered, 10);

  return <>
    <PageHeader title="คำขอรับเลี้ยง">ทุกเคส เรียงจากเร่งด่วนที่สุด · เจ้าของตอบรับแล้วยังไม่ถือว่ารับเลี้ยงสำเร็จจนกว่าจะยืนยันการส่งมอบ</PageHeader>
    <Card>
      <Chips label="ประเภทเคส" value={filter} onChange={(value) => { setParam("filter", value); reset(); }}
        options={(Object.keys(quick) as Quick[]).map((key) => [key, quick[key], data.cases.filter((item) => test(item, key)).length] as const)} />
      <div className="ad-filters ad-mt">
        <div className="ad-field-wide"><SearchInput label="ค้นหาคำขอ" value={query} onChange={(value) => { setQuery(value); reset(); }} placeholder="ชื่อน้อง ชื่อคน หรือรหัสเคส" /></div>
        <Select label="ขั้นตอน" value={stage} onChange={(value) => { setParam("stage", value); reset(); }} options={[["all", "ทุกขั้นตอน"], ...Object.entries(stageLabel) as [Stage, string][]]} />
        <Select label="ความเร่งด่วน" value={priority} onChange={(value) => { setPriority(value); reset(); }} options={[["all", "ทุกระดับ"], ...Object.entries(priorityLabel) as [Priority, string][]]} />
        <Select label="เรียงตาม" value={sort} onChange={setSort} options={[["urgency", "ความเร่งด่วน"], ["idle", "เงียบนานที่สุด"], ["newest", "สร้างล่าสุด"], ["oldest", "สร้างเก่าสุด"]]} />
      </div>
      <h2 className="ad-card-title-sm" aria-live="polite">รายการคำขอ · {filtered.length} เคส</h2>
      {rows.length ? <ul className="ad-cases">{rows.map(({ item }) => <CaseRow key={item.id} data={data} item={item} />)}</ul> : <Empty title="ไม่พบรายการที่ตรงกับตัวกรอง" />}
      {pager}
    </Card>
  </>;
}

export function StepIndicator({ item }: { item: AdoptionCase }) {
  const current = currentStep(item);
  const stopped = item.stage === "REJECTED" || item.stage === "CANCELLED";
  return <ol className="ad-steps" aria-label="ความคืบหน้าของเคส">
    {caseSteps.map((step, index) => <li key={step} data-done={index < current && (!stopped || index === 0)} data-stopped={stopped && index === current}
      aria-current={index === current ? "step" : undefined}>
      <span aria-hidden="true">{index < current && (!stopped || index === 0) ? "✓ " : `${index + 1}. `}</span>{step}
      {stopped && index === current && <span className="ad-small"> · {stageLabel[item.stage]}</span>}
    </li>)}
  </ol>;
}

export function CaseBadges({ item, now }: { item: AdoptionCase; now: number }) {
  const policy = followUp(item, now);
  const [chip, tone] = item.disputed ? priorityChip.urgent : priorityChip[policy.priority];
  return <div className="ad-row">
    <Badge tone={stageTone(item)}>{stageLabel[item.stage]}</Badge>
    {!isTerminal(item.stage) && !item.closed && <Badge tone={tone}>{chip}</Badge>}
    {item.disputed && <Badge tone="danger">ต้องตรวจสอบ</Badge>}
    {item.flagged && <Badge tone="warning">ต้องติดตาม (ธง)</Badge>}
    {item.escalated && <Badge tone="danger">ส่งต่อเร่งด่วน</Badge>}
    {item.verified && <Badge tone="success">ตรวจสอบแล้ว</Badge>}
    {item.closed && <Badge>ปิดเคสแล้ว</Badge>}
  </div>;
}

const tabs = [["overview", "ภาพรวม"], ["timeline", "ไทม์ไลน์"], ["notifications", "ตัวอย่างแจ้งเตือน"], ["notes", "บันทึกติดตาม"], ["handover", "รายงานส่งมอบ"]] as const;
type Prompt = "contact" | "note" | "verify";
const promptTitle: Record<Prompt, string> = { contact: "บันทึกการติดต่อ", note: "เพิ่มบันทึกติดตาม", verify: "ยืนยันผลตรวจสอบการส่งมอบ" };

export function CaseDetail() {
  const { id } = useParams();
  const item = usePreview((state) => state.cases.find((entry) => entry.id === id));
  if (!item) return <><PageHeader title="ไม่พบเคส">ไม่มีเคส {id} ในข้อมูลจำลอง</PageHeader><Link className="ad-btn-link" to="/admin/adoptions">← กลับไปรายการคำขอ</Link></>;
  return <CaseWorkspace key={item.id} item={item} />;
}

function CaseWorkspace({ item }: { item: AdoptionCase }) {
  const data = usePreview();
  const now = previewNow(data);
  const [params] = useSearchParams();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const { confirm, dialog } = useConfirmation();
  const tab = tabs.find(([key]) => key === params.get("tab"))?.[0] ?? "overview";
  const pet = petOf(data, item.petId);
  const policy = followUp(item, now);
  const next = insight(item, now);
  const open = !item.closed && !isTerminal(item.stage);
  const run = (action: CaseAction, message: string) => { if (data.act(item.id, action)) notify(message); };
  const canVerify = !item.closed && !item.verified && (item.stage === "COMPLETED" || (item.disputed && reportsMatch(item) && item.confirmations.owner && item.confirmations.applicant));

  return <>
    <Link className="ad-btn-link" to="/admin/adoptions">← คำขอรับเลี้ยงทั้งหมด</Link>
    <div className="ad-item">
      <Thumb src={pet?.imageUrl ?? ""} name={pet?.name ?? ""} className="ad-thumb ad-thumb-lg" />
      <div className="ad-stack">
        <PageHeader title={pet?.name ?? "–"}>{item.id} · ส่งคำขอเมื่อ {formatDateTime(item.createdAt)}</PageHeader>
        <CaseBadges item={item} now={now} />
      </div>
    </div>
    <Card title="ความคืบหน้าของเคส">
      <StepIndicator item={item} />
      <div className={`ad-callout ad-mt ${item.disputed ? "ad-callout-danger" : ""}`}>
        <span className="ad-muted">{next.reason} · เงียบ {idleText(policy.hours)}</span><b>→ {next.action}</b>
      </div>
    </Card>

    <nav className="ad-tabs" aria-label="รายละเอียดเคส">
      {tabs.map(([key, label]) => <Link key={key} to={key === "overview" ? "?" : `?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}
    </nav>

    {tab === "overview" && <Card title="ข้อมูลคำขอรับเลี้ยง">
      <dl className="ad-details">
        <div><dt>ผู้ขอรับเลี้ยง</dt><dd>{userName(data, item.applicantId)}</dd></div>
        <div><dt>เจ้าของโพสต์</dt><dd>{userName(data, ownerOf(data, item))}</dd></div>
        <div><dt>ที่พักอาศัย</dt><dd>{item.housing}</dd></div>
        <div><dt>ช่องทางติดต่อ</dt><dd>{item.contact}</dd></div>
        <div><dt>ดำเนินการสำคัญล่าสุด</dt><dd>{formatDateTime(item.activityAt)}</dd></div>
        <div><dt>ความเร่งด่วน</dt><dd>{priorityLabel[policy.priority]}{policy.required && " · ต้องติดตาม"}</dd></div>
      </dl>
      <p className="ad-mt ad-pre"><span className="ad-muted ad-small">ข้อความถึงเจ้าของ</span><br />{item.message}</p>
    </Card>}
    {tab === "timeline" && <Card title="ไทม์ไลน์"><Timeline item={item} /></Card>}
    {tab === "notifications" && <Card title="ตัวอย่างแจ้งเตือน 24 / 48 / 72 ชั่วโมง" subtitle="นับจากการดำเนินการสำคัญล่าสุดขณะรอเจ้าของตอบกลับ · ไม่มีการอนุมัติ ปฏิเสธ หรือปิดเคสอัตโนมัติ">
      {([[24, "แจ้งเตือนเจ้าของครั้งแรก", "ระบบส่งข้อความเตือนเจ้าของโพสต์ (ตัวอย่าง)"],
        [48, "แจ้งเตือนครั้งที่สอง · Admin ต้องติดตาม", "เคสเข้าคิวติดตามของผู้ดูแล"],
        [72, "ไม่ตอบกลับ · ส่งต่อเร่งด่วน", "ผู้ดูแลติดต่อเจ้าของ และแนะนำผู้ขอดูน้องตัวอื่นถ้ายังเงียบ"]] as const).map(([hours, title, detail]) =>
        <div className="ad-threshold" key={hours}>
          <strong>{hours} ชม.</strong>
          <div className="ad-min0"><b>{title}</b><p className="ad-muted ad-small">{detail}</p></div>
          <Badge tone={item.stage !== "PENDING" ? "neutral" : policy.idle >= hours ? "warning" : "navy"}>
            {item.stage !== "PENDING" ? "พ้นช่วงรอเจ้าของ" : policy.idle >= hours ? "ถึงเกณฑ์" : `อีก ${hours - policy.idle} ชม.`}
          </Badge>
        </div>)}
      <p className="ad-muted ad-small ad-mt">การบันทึกว่าผู้ดูแลติดต่อแล้วไม่รีเซ็ตเวลาที่เจ้าของไม่ตอบกลับ</p>
    </Card>}
    {tab === "notes" && <Card title="บันทึกติดตามของผู้ดูแล"><Timeline item={item} notesOnly /></Card>}
    {tab === "handover" && <Card title="รายงานและการยืนยันการส่งมอบ"><HandoverDetails item={item} /></Card>}

    <Card title="การดำเนินการของผู้ดูแล" subtitle="มีผลกับข้อมูลจำลองเท่านั้น · ผู้ดูแลไม่เลือกผู้รับเลี้ยงแทนเจ้าของ">
      <div className="ad-row">
        {open && <>
          <button type="button" className="ad-btn" onClick={() => run({ type: item.flagged ? "unflag" : "flag" }, item.flagged ? "นำธงออกแล้ว" : "ตั้งธงต้องติดตามแล้ว")}>
            {item.flagged ? "นำธงต้องติดตามออก" : "ตั้งธงต้องติดตาม"}
          </button>
          <button type="button" className="ad-btn" onClick={() => setPrompt("contact")}>บันทึกการติดต่อ</button>
          <button type="button" className="ad-btn" onClick={() => setPrompt("note")}>เพิ่มบันทึกติดตาม</button>
          {!item.escalated && <button type="button" className="ad-btn" onClick={() => run({ type: "escalate" }, "ส่งต่อเคสเร่งด่วนแล้ว")}>ส่งต่อเร่งด่วน</button>}
          {item.stage === "HANDOVER_REPORTED" && tab !== "handover" && <Link className="ad-btn" to="?tab=handover">ตรวจรายงานส่งมอบ</Link>}
          {item.stage === "HANDOVER_REPORTED" && !item.disputed && <button type="button" className="ad-btn" onClick={() => confirm({
            title: "ทำเครื่องหมายข้อพิพาท", description: "เคสจะเข้าคิวตรวจสอบ และปิดเป็นสำเร็จได้หลังผู้ดูแลยืนยันผลตรวจเท่านั้น", label: "ทำเครื่องหมาย", danger: true,
            action: () => run({ type: "markDisputed" }, "ทำเครื่องหมายข้อพิพาทแล้ว"),
          })}>ทำเครื่องหมายข้อพิพาท</button>}
          <Link className="ad-btn" to={`/admin/workflow-preview?case=${item.id}`}>เปิดมุมมองเจ้าของ / ผู้ขอ</Link>
        </>}
        {canVerify && <button type="button" className="ad-btn ad-btn-primary" onClick={() => setPrompt("verify")}>ยืนยันผลตรวจสอบการส่งมอบ</button>}
        {!item.closed && isTerminal(item.stage) && <button type="button" className="ad-btn" onClick={() => confirm({
          title: "ปิดเคส", description: "ปิดเคสและเก็บประวัติไว้ หลังปิดแล้วจะดำเนินการกับเคสนี้ไม่ได้อีก", label: "ปิดเคส",
          action: () => run({ type: "close" }, "ปิดเคสแล้ว"),
        })}>ปิดเคส</button>}
        {item.closed && <p className="ad-muted">เคสนี้ปิดแล้ว</p>}
      </div>
      {item.disputed && !canVerify && <p className="ad-muted ad-small ad-mt">ยืนยันผลตรวจได้เมื่อรายงานสองฝ่ายตรงกันและทั้งคู่ยืนยันแล้ว</p>}
    </Card>

    {prompt && <NotePrompt title={promptTitle[prompt]} verify={prompt === "verify"} onClose={() => setPrompt(null)} onSave={(note) => {
      setPrompt(null);
      if (prompt === "verify") confirm({ title: promptTitle.verify, description: "บันทึกผลตรวจและยืนยันว่าการส่งมอบเกิดขึ้นจริง (ข้อมูลจำลอง)", label: "ยืนยันผลตรวจ", action: () => run({ type: "verify", note }, "ยืนยันผลตรวจสอบแล้ว") });
      else run({ type: prompt, note }, prompt === "contact" ? "บันทึกการติดต่อแล้ว" : "เพิ่มบันทึกแล้ว");
    }} />}
    {dialog}
  </>;
}

function NotePrompt({ title, verify, onClose, onSave }: { title: string; verify: boolean; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (note.trim()) onSave(note); };
  return <Dialog title={title} onClose={onClose}>
    <form className="ad-stack" onSubmit={submit}>
      <Field label={verify ? "ผลตรวจสอบและหลักฐาน" : "รายละเอียด"}><textarea required rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <div className="ad-row"><button type="button" className="ad-btn" onClick={onClose}>กลับ</button><button type="submit" className="ad-btn ad-btn-primary" disabled={!note.trim()}>บันทึก</button></div>
    </form>
  </Dialog>;
}

export function Timeline({ item, notesOnly }: { item: AdoptionCase; notesOnly?: boolean }) {
  const events = (notesOnly ? item.timeline.filter((event) => event.actor === "admin") : item.timeline).slice().reverse();
  if (!events.length) return <Empty title="ยังไม่มีบันทึกติดตาม" />;
  return <ol className="ad-timeline">
    {events.map((event, index) => <li key={index} data-admin={event.actor === "admin"}>
      <p><b>{event.label}</b></p>
      <p className="ad-muted ad-small">{partyLabel[event.actor]} · {formatDateTime(event.at)}</p>
      {event.note && <p className="ad-pre">“{event.note}”</p>}
    </li>)}
  </ol>;
}

export function HandoverDetails({ item }: { item: AdoptionCase }) {
  const [evidence, setEvidence] = useState<Party | null>(null);
  return <div className="ad-stack">
    {item.disputed && <div className="ad-callout ad-callout-danger"><b>ต้องตรวจสอบ · รายงานสองฝ่ายไม่ตรงกัน</b>ผู้ดูแลต้องตรวจข้อเท็จจริงก่อนปิดเป็นสำเร็จ</div>}
    <div className="ad-grid-2">
      {(["owner", "applicant"] as const).map((party) => {
        const report = item.reports[party];
        return <section key={party} className="ad-card ad-stack">
          <h3>รายงานโดย{partyLabel[party]}</h3>
          {report ? <>
            <dl className="ad-details">
              <div><dt>วันที่ส่งมอบ</dt><dd>{report.date}</dd></div>
              <div><dt>สถานะ</dt><dd>{handoverLabel[report.status]}</dd></div>
            </dl>
            {report.note && <p className="ad-pre ad-muted">{report.note}</p>}
            {report.evidence && <button type="button" className="ad-btn" onClick={() => setEvidence(party)}>ดูหลักฐานตัวอย่าง</button>}
          </> : <p className="ad-muted">ยังไม่มีรายงาน</p>}
          <Badge tone={item.confirmations[party] ? "success" : "neutral"}>{item.confirmations[party] ? "✓ ยืนยันแล้ว" : "ยังไม่ยืนยัน"}</Badge>
        </section>;
      })}
    </div>
    <p>การตรวจสอบโดยผู้ดูแล · <Badge tone={item.verified ? "success" : "neutral"}>{item.verified ? "ตรวจสอบแล้ว" : "ยังไม่ได้ตรวจสอบ"}</Badge></p>
    {item.resolution && <p className="ad-pre ad-muted">ผลตรวจสอบ: {item.resolution}</p>}
    {evidence && <Dialog title={`หลักฐานตัวอย่างจาก${partyLabel[evidence]}`} onClose={() => setEvidence(null)}>
      <div className="ad-evidence" aria-hidden="true">ภาพตัวอย่าง</div>
      <p className="ad-mt">รายงานวันที่ {item.reports[evidence]?.date} · เป็นภาพตัวอย่าง ไม่มีไฟล์จริง</p>
    </Dialog>}
  </div>;
}
