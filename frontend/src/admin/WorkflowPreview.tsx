import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useConfirmation } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { formatAge, sexLabel, speciesLabel } from "../types/pet";
import { CaseBadges, HandoverDetails, StepIndicator } from "./Adoptions";
import { demoPetId, hasOtherPlacement, petOf, petStatus, previewNow, usePreview, userName, workflowCase } from "./store";
import { Card, Chips, Empty, Field, notify, PageHeader, Select, Thumb } from "./ui";
import { handoverLabel, isTerminal, partyLabel, reportsMatch, type CaseAction, type Handover, type Party } from "./workflow";

type Perspective = "owner" | "applicant" | "public";

export function WorkflowPreview() {
  const data = usePreview();
  const now = previewNow(data);
  const [params] = useSearchParams();
  const [perspective, setPerspective] = useState<Perspective>("owner");
  const [reporting, setReporting] = useState<Party | null>(null);
  const { confirm, dialog } = useConfirmation();
  const selectedId = params.get("case");
  const item = selectedId ? data.cases.find((entry) => entry.id === selectedId) : workflowCase(data);
  const pet = petOf(data, item?.petId ?? demoPetId);
  const active = Boolean(item && !isTerminal(item.stage) && !item.closed);
  const party: Party = perspective === "owner" ? "owner" : "applicant";
  const competing = Boolean(item && hasOtherPlacement(data, item));
  const canSubmit = !selectedId && pet?.visibility === "visible" && !active &&
    !data.cases.some((entry) => entry.petId === demoPetId && entry.stage === "COMPLETED");
  const run = (action: CaseAction, message: string) => { if (item && data.act(item.id, action)) notify(message); };

  if (selectedId && !item) return <><PageHeader title="ไม่พบสถานการณ์" /><Link className="ad-btn-link" to="/admin/workflow-preview">กลับไปตัวจำลอง</Link></>;

  return <>
    <PageHeader title="จำลองขั้นตอนรับเลี้ยง" action={selectedId
      ? <Link className="ad-btn" to="/admin/workflow-preview">กลับไปสถานการณ์ตั้งต้น</Link>
      : <button type="button" className="ad-btn" onClick={() => confirm({
        title: "เริ่มสถานการณ์ใหม่", description: "ลบคำขอในตัวจำลองนี้และเริ่มต้นใหม่ (ไม่กระทบเคสอื่น)", label: "เริ่มใหม่",
        action: () => { data.resetScenario(); setPerspective("applicant"); notify("เริ่มสถานการณ์ใหม่แล้ว"); },
      })}>เริ่มสถานการณ์ใหม่</button>}>
      สลับมุมมองเพื่อทดสอบการตอบรับ นัดหมาย และยืนยันการส่งมอบ · ใช้ได้เฉพาะ Development Preview ไม่เชื่อมกับ API จริง
    </PageHeader>
    <Chips label="มุมมองในตัวจำลอง" value={perspective} onChange={setPerspective}
      options={[["owner", `เจ้าของ (${userName(data, pet?.ownerId ?? "")})`], ["applicant", `ผู้ขอรับเลี้ยง (${item ? userName(data, item.applicantId) : "พิม"})`], ["public", "ผู้เข้าชมทั่วไป"]]} />

    {pet && (perspective !== "public" || pet.visibility === "visible") ? <Card title={pet.name} subtitle={perspective === "public" ? "สิ่งที่ผู้เข้าชมเห็น: ข้อมูลสาธารณะเท่านั้น" : undefined}>
      <div className="ad-item">
        <Thumb src={pet.imageUrl} name={pet.name} className="ad-thumb ad-thumb-lg" />
        <div className="ad-stack">
          <p>{speciesLabel[pet.species]} · {formatAge(pet.ageMonths)} · {sexLabel[pet.sex]} · {pet.province}</p>
          <p className="ad-muted">{pet.description || "ยังไม่มีรายละเอียด"}</p>
          <p>สถานะน้อง: <b>{petStatus(data, pet)}</b></p>
        </div>
      </div>
    </Card> : <Card><Empty title="ไม่มีโพสต์ที่เปิดให้ผู้เข้าชมเห็น" /></Card>}

    {perspective === "public" ? <p className="ad-muted ad-small">ผู้เข้าชมไม่เห็นเบอร์ติดต่อ ข้อความส่วนตัวของผู้ขอ หรือบันทึกติดตามของผู้ดูแล</p> : pet && <>
      <Card title="สถานะคำขอ" action={item && <CaseBadges item={item} now={now} />}>
        {item ? <StepIndicator item={item} /> : <p className="ad-muted">ยังไม่มีคำขอในสถานการณ์นี้ · สลับเป็น "ผู้ขอรับเลี้ยง" แล้วกดส่งคำขอ</p>}
        <div className="ad-row ad-mt">
          {perspective === "applicant" && canSubmit && <button type="button" className="ad-btn ad-btn-primary" onClick={() => { data.submit(); notify("ส่งคำขอจำลองแล้ว"); }}>ส่งคำขอรับเลี้ยง</button>}
          {perspective === "owner" && active && item?.stage === "PENDING" && <>
            <button type="button" className="ad-btn ad-btn-primary" disabled={competing} onClick={() => run({ type: "accept" }, "ตอบรับคำขอแล้ว")}>ตอบรับคำขอ</button>
            <button type="button" className="ad-btn ad-btn-danger" onClick={() => confirm({ title: "ปฏิเสธคำขอ", description: "ผู้ขอจะเห็นว่าคำขอไม่ผ่าน (ข้อมูลจำลอง)", label: "ปฏิเสธคำขอ", danger: true, action: () => run({ type: "reject" }, "ปฏิเสธคำขอแล้ว") })}>ปฏิเสธคำขอ</button>
          </>}
          {perspective === "owner" && active && item?.stage === "ACCEPTED" && <button type="button" className="ad-btn ad-btn-primary" onClick={() => run({ type: "arrange" }, "เริ่มนัดส่งมอบแล้ว")}>เริ่มนัดส่งมอบ</button>}
          {perspective === "applicant" && active && item?.stage !== "HANDOVER_REPORTED" && <button type="button" className="ad-btn ad-btn-danger" onClick={() => confirm({ title: "ยกเลิกคำขอ", description: "ยกเลิกคำขอรับเลี้ยงนี้ (ข้อมูลจำลอง)", label: "ยกเลิกคำขอ", danger: true, action: () => run({ type: "cancel" }, "ยกเลิกคำขอแล้ว") })}>ยกเลิกคำขอ</button>}
          {active && (item?.stage === "ARRANGING_HANDOVER" || item?.stage === "HANDOVER_REPORTED") &&
            <button type="button" className="ad-btn ad-btn-primary" onClick={() => setReporting(party)}>
              {item.reports[party] ? "แก้ไขรายงานส่งมอบ" : party === "owner" ? "รายงานการส่งมอบ" : "รายงานการรับสัตว์"}
            </button>}
          {item && active && item.stage === "HANDOVER_REPORTED" && <>
            {reportsMatch(item) && !item.confirmations[party] && <button type="button" className="ad-btn" onClick={() => run({ type: "confirm", party }, "ยืนยันรายละเอียดส่งมอบแล้ว")}>
              {party === "owner" ? "ยืนยันการส่งมอบ" : "ยืนยันรายละเอียดการรับสัตว์"}
            </button>}
            {!item.disputed && <button type="button" className="ad-btn ad-btn-danger" onClick={() => confirm({ title: "แจ้งข้อมูลไม่ถูกต้อง", description: "เคสจะถูกทำเครื่องหมายข้อพิพาทและเข้าคิวตรวจสอบของผู้ดูแล", label: "แจ้งข้อพิพาท", danger: true, action: () => run({ type: "dispute", party }, "แจ้งข้อพิพาทแล้ว") })}>แจ้งข้อมูลไม่ถูกต้อง</button>}
          </>}
          {item && <Link className="ad-btn" to={`/admin/adoptions/${item.id}`}>เปิดเคสในหน้าผู้ดูแล</Link>}
        </div>
        {perspective === "owner" && item?.stage === "PENDING" && competing && <p className="ad-muted ad-small ad-mt">โพสต์นี้มีคำขออื่นที่ตอบรับไปแล้ว จึงตอบรับซ้ำไม่ได้</p>}
        {item?.stage === "HANDOVER_REPORTED" && !reportsMatch(item) && <p className="ad-muted ad-small ad-mt">ยืนยันได้เมื่อทั้งสองฝ่ายรายงาน "ส่งมอบแล้ว" วันเดียวกัน</p>}
      </Card>
      {item && (item.stage === "HANDOVER_REPORTED" || item.stage === "COMPLETED") && <Card title="รายงานส่งมอบ"><HandoverDetails item={item} /></Card>}
    </>}

    {reporting && <Dialog title={`รายงานโดย${partyLabel[reporting]}`} onClose={() => setReporting(null)}>
      <ReportForm report={item?.reports[reporting]} onSave={(report) => { run({ type: "report", party: reporting, report }, "บันทึกรายงานแล้ว"); setReporting(null); }} />
    </Dialog>}
    {dialog}
  </>;
}

function ReportForm({ report, onSave }: { report?: Handover; onSave: (report: Handover) => void }) {
  const [form, setForm] = useState<Handover>(report ?? { date: "", status: "delivered", note: "", evidence: false });
  return <form className="ad-stack" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, note: form.note.trim() }); }}>
    <Field label="วันที่ส่งมอบ"><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field>
    <Select label="สถานะการส่งมอบ" value={form.status} onChange={(status) => setForm({ ...form, status })} options={Object.entries(handoverLabel) as [Handover["status"], string][]} />
    <Field label="หมายเหตุ"><textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <label className="ad-check"><input type="checkbox" checked={form.evidence} onChange={(event) => setForm({ ...form, evidence: event.target.checked })} />แนบหลักฐานตัวอย่าง (ไม่มีการอัปโหลดจริง)</label>
    <button type="submit" className="ad-btn ad-btn-primary">บันทึกรายงาน</button>
  </form>;
}
