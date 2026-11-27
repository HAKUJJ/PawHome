import { useState, type FormEvent } from "react";
import { useAdoptionTimeline, useArrangeHandover, useConfirmHandover, useDisputeHandover, useReportHandover } from "../hooks/useAdoptions";
import type { AdoptionRequest, HandoverInput, HandoverReport } from "../types/adoption";
import { timeAgo } from "../types/pet";
import { useConfirmation } from "./ConfirmDialog";
import { Field, inputClass } from "./Field";

type Party = "OWNER" | "APPLICANT";

// ขั้นตอนส่งมอบน้องหลังผู้โพสต์ตอบรับ (ใช้ทั้งฝั่งเจ้าของโพสต์และผู้ขอ)
// ตอบรับ ≠ ได้บ้านแล้ว: น้องเปลี่ยนเป็น "ได้บ้านแล้ว" เมื่อรายงานสองฝ่ายตรงกันและยืนยันครบ (หรือผู้ดูแลตรวจยืนยัน)
// ปุ่มทุกปุ่มแค่ส่งคำสั่ง — Backend ตรวจสิทธิ์และขั้นปัจจุบันเองทุกครั้ง
const steps = ["ส่งคำขอ", "ตอบรับ", "นัดส่งมอบ", "รายงานส่งมอบ", "รับเลี้ยงสำเร็จ"];
const stepIndex: Record<string, number> = { PENDING: 0, ACCEPTED: 1, ARRANGING_HANDOVER: 2, HANDOVER_REPORTED: 3, COMPLETED: 4 };

export const reportsMatch = (a?: HandoverReport | null, b?: HandoverReport | null) =>
  Boolean(a && b && a.outcome === "HANDED_OVER" && b.outcome === "HANDED_OVER" && a.handoverDate === b.handoverDate);

export default function HandoverPanel({ request, party }: { request: AdoptionRequest; party: Party }) {
  const stage = request.stage;
  if (!stage || stage === "PENDING" || stage === "REJECTED") return null;
  if (request.legacyReview) {
    return <p className="rounded-xl bg-sand/60 px-4 py-3 text-sm">อนุมัติแล้วด้วยขั้นตอนแบบเดิม · ผู้ดูแลจะติดต่อเพื่อยืนยันว่าได้ส่งมอบน้องแล้ว</p>;
  }
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {stage !== "CANCELLED" && <Steps current={stepIndex[stage] ?? 0} />}
      <StageContent request={request} party={party} />
      <TimelineToggle id={request.id} />
    </div>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <ol aria-label="ขั้นตอนการรับเลี้ยง" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {steps.map((label, index) => (
        <li key={label} aria-current={index === current ? "step" : undefined}
          className={`flex items-center gap-1.5 ${index <= current ? "text-navy font-semibold" : "text-muted"}`}>
          <span aria-hidden="true" className={`size-5 grid place-items-center rounded-full text-xs ${index <= current ? "bg-navy text-white" : "bg-sand text-ink"}`}>
            {index < current ? "✓" : index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function StageContent({ request, party }: { request: AdoptionRequest; party: Party }) {
  const arrange = useArrangeHandover();
  const confirmHandover = useConfirmHandover();
  const { confirm, dialog } = useConfirmation();
  const handover = request.handover;
  const mine = party === "OWNER" ? handover?.owner : handover?.applicant;
  const theirs = party === "OWNER" ? handover?.applicant : handover?.owner;
  const iConfirmed = party === "OWNER" ? handover?.ownerConfirmed : handover?.applicantConfirmed;
  const otherLabel = party === "OWNER" ? "ผู้ขอ" : "ผู้โพสต์";

  switch (request.stage) {
    case "CANCELLED":
      return <p className="text-muted">คำขอนี้ถูกยกเลิกโดยผู้ขอแล้ว</p>;
    case "COMPLETED":
      return <p className="rounded-xl bg-navy-soft text-navy px-4 py-3 font-semibold">รับเลี้ยงสำเร็จ ขอบคุณที่ช่วยให้น้องได้บ้าน 🐾</p>;
    case "ACCEPTED":
      return party === "OWNER" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">โทรนัดวันเวลาส่งมอบกับผู้ขอ แล้วกดเริ่มขั้นตอนส่งมอบ</p>
          <button type="button" disabled={arrange.isPending} onClick={() => arrange.mutate(request.id)}
            className="self-start min-h-11 px-5 rounded-xl bg-navy text-white font-semibold disabled:opacity-50">
            {arrange.isPending ? "กำลังบันทึก..." : "เริ่มนัดส่งมอบ"}
          </button>
        </div>
      ) : (
        <p className="text-muted">ผู้โพสต์ตอบรับแล้ว รอผู้โพสต์โทรนัดวันส่งมอบน้อง</p>
      );
    default: {
      const matched = reportsMatch(handover?.owner, handover?.applicant);
      return (
        <div className="flex flex-col gap-3">
          {dialog}
          <div className="grid gap-2 sm:grid-cols-2">
            <ReportCard title="รายงานของคุณ" report={mine} />
            <ReportCard title={`รายงานของ${otherLabel}`} report={theirs} />
          </div>
          {request.disputed && (
            <p role="status" className="rounded-xl bg-danger/10 text-danger px-4 py-3 text-sm">
              ข้อมูลการส่งมอบไม่ตรงกัน ผู้ดูแลกำลังตรวจสอบ · แก้ไขรายงานให้ตรงกับความจริงได้
            </p>
          )}
          {/* ข้อพิพาท: ยังยืนยันได้ (ผู้ดูแลปิดเคสได้เมื่อรายงานตรงกันและยืนยันครบ) แต่ไม่สำเร็จอัตโนมัติ */}
          {request.stage === "HANDOVER_REPORTED" && matched && (
            iConfirmed ? <p className="text-sm text-navy font-semibold">คุณยืนยันแล้ว รอ{otherLabel}ยืนยัน</p> : (
              <button type="button" disabled={confirmHandover.isPending}
                onClick={() => confirm({
                  title: "ยืนยันรายละเอียดการส่งมอบ",
                  description: request.disputed
                    ? `วันที่ส่งมอบ ${mine?.handoverDate ?? ""} · เคสนี้มีข้อพิพาท ผู้ดูแลจะตรวจสอบก่อนปิดเป็นรับเลี้ยงสำเร็จ`
                    : `วันที่ส่งมอบ ${mine?.handoverDate ?? ""} · เมื่อทั้งสองฝ่ายยืนยัน น้องจะเปลี่ยนเป็นได้บ้านแล้ว`,
                  label: "ยืนยัน",
                  action: () => confirmHandover.mutate(request.id),
                })}
                className="self-start min-h-11 px-5 rounded-xl bg-navy text-white font-semibold disabled:opacity-50">
                ยืนยันรายละเอียดการส่งมอบ
              </button>
            )
          )}
          {request.stage === "HANDOVER_REPORTED" && !matched && mine && theirs && !request.disputed && (
            <p className="text-sm text-muted">รายงานสองฝ่ายยังไม่ตรงกัน (ต้องส่งมอบแล้วและวันที่เดียวกัน) จึงยังยืนยันไม่ได้</p>
          )}
          <ReportForm request={request} party={party} hasReport={Boolean(mine)} />
          {request.stage === "HANDOVER_REPORTED" && !request.disputed && <DisputeForm id={request.id} />}
        </div>
      );
    }
  }
}

function ReportCard({ title, report }: { title: string; report?: HandoverReport | null }) {
  return (
    <div className="rounded-xl border border-line p-3 text-sm">
      <p className="font-semibold">{title}</p>
      {report ? (
        <>
          <p>{report.outcome === "HANDED_OVER" ? "ส่งมอบแล้ว" : "ยังไม่ได้ส่งมอบ"} · วันที่ {report.handoverDate}</p>
          {report.note && <p className="text-muted whitespace-pre-line">“{report.note}”</p>}
          <p className="text-muted">บันทึกเมื่อ {timeAgo(report.createdAt)}</p>
        </>
      ) : <p className="text-muted">ยังไม่ได้รายงาน</p>}
    </div>
  );
}

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // วันที่ตามเวลาไทย

function ReportForm({ request, party, hasReport }: { request: AdoptionRequest; party: Party; hasReport: boolean }) {
  const [open, setOpen] = useState(!hasReport);
  const [form, setForm] = useState<HandoverInput>({ handoverDate: today(), outcome: "HANDED_OVER", note: "" });
  const report = useReportHandover();
  const label = party === "OWNER" ? "แจ้งว่าส่งมอบน้องแล้ว" : "แจ้งว่าได้รับน้องแล้ว";

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="self-start min-h-11 px-4 rounded-xl border border-line font-semibold hover:border-navy">แก้ไขรายงานของคุณ</button>;
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    report.mutate({ id: request.id, input: { ...form, note: form.note.trim() } }, { onSuccess: () => setOpen(false) });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-ground p-3" aria-label={label}>
      <p className="font-semibold">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="วันที่ส่งมอบ *">
          <input type="date" required max={today()} value={form.handoverDate} onChange={(e) => setForm({ ...form, handoverDate: e.target.value })} className={inputClass(false)} />
        </Field>
        <Field label="ผลการส่งมอบ *">
          <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value as HandoverInput["outcome"] })} className={inputClass(false)}>
            <option value="HANDED_OVER">ส่งมอบ/รับน้องแล้ว</option>
            <option value="NOT_HANDED_OVER">ยังไม่ได้ส่งมอบ</option>
          </select>
        </Field>
      </div>
      <Field label="บันทึกเพิ่มเติม" hint="เช่น สถานที่ส่งมอบ ของที่ให้มาด้วย">
        <textarea rows={2} maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={`${inputClass(false)} py-2`} />
      </Field>
      <p className="text-xs text-muted">รายงานใหม่จะล้างการยืนยันเดิมของทั้งสองฝ่าย</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={report.isPending} className="min-h-11 px-5 rounded-xl bg-navy text-white font-semibold disabled:opacity-50">
          {report.isPending ? "กำลังบันทึก..." : "บันทึกรายงาน"}
        </button>
        {hasReport && <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-4 rounded-xl border border-line">ยกเลิก</button>}
      </div>
    </form>
  );
}

function DisputeForm({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const dispute = useDisputeHandover();
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-danger underline underline-offset-4 min-h-11">ข้อมูลไม่ตรงกับความจริง? แจ้งผู้ดูแล</button>;
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 5) dispute.mutate({ id, note: note.trim() }, { onSuccess: () => setOpen(false) }); }}>
      <Field label="อธิบายปัญหา (อย่างน้อย 5 ตัวอักษร)">
        <textarea rows={2} required minLength={5} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass(false)} py-2`} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" disabled={dispute.isPending || note.trim().length < 5} className="min-h-11 px-4 rounded-xl border border-danger text-danger font-semibold disabled:opacity-50">แจ้งผู้ดูแล</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-4 rounded-xl border border-line">ยกเลิก</button>
      </div>
    </form>
  );
}

const role = { OWNER: "ผู้โพสต์", APPLICANT: "ผู้ขอ", ADMIN: "ผู้ดูแล", SYSTEM: "ระบบ" } as const;

function TimelineToggle({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useAdoptionTimeline(id, open);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="text-sm text-navy font-semibold underline underline-offset-4 min-h-11">
        {open ? "ซ่อนประวัติการดำเนินการ" : "ดูประวัติการดำเนินการ"}
      </button>
      {open && (
        <div className="mt-1">
          {isLoading && <p role="status" className="text-sm text-muted">กำลังโหลด...</p>}
          {isError && <p className="text-sm text-danger">โหลดประวัติไม่สำเร็จ <button type="button" className="underline" onClick={() => refetch()}>ลองใหม่</button></p>}
          {data && (data.length ? (
            <ol className="flex flex-col gap-1.5 border-l-2 border-line pl-3 text-sm">
              {data.map((event, index) => (
                <li key={index}><span className="font-medium">{event.label}</span> <span className="text-muted">· {role[event.actorRole]} · {timeAgo(event.at)}</span></li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted">ยังไม่มีประวัติ</p>)}
        </div>
      )}
    </div>
  );
}

