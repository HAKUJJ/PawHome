import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import PetImage from "../components/PetImage";
import { useToastStore } from "../stores/useToastStore";
import { idleText, ownerOf, petOf, userName, type PreviewData } from "./store";
import { followUp, isTerminal, priorityRank, reportsMatch, stageLabel, type AdoptionCase, type Priority } from "./workflow";

// ---------- ไอคอนเส้น ----------
const paths = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6",
  megaphone: "M4 10v4l3 .5L9 20h2l-1-5 8 3V6l-11 4H4Z M18 10a2 2 0 0 1 0 4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  search: "M10.5 16a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm4.5-1 4 4",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4",
  chevron: "m9 6 6 6-6 6",
  back: "m15 6-6 6 6 6",
  clipboard: "M9 4h6v3H9zM7 5.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-1M9 12h6M9 16h4",
  history: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2",
  handover: "M3 12h4l3-3 4 1 4-2 3 2v5l-4 2-4-1-3 2-3-2H3zM10 9l3 4",
  check: "m5 12 4 4 10-10",
  menu: "M4 7h16M4 12h16M4 17h16",
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  plus: "M12 5v14M5 12h14",
  paw: "M8 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-7 5c-2.5 0-4.5-1-4.5-3S9.5 13 12 13s4.5 2 4.5 4-2 3-4.5 3Z",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

// ---------- โครงหน้า ----------
export function PageHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <header className="ad-head"><div><h1>{title}</h1>{children && <p>{children}</p>}</div>{action}</header>;
}

export function Card({ title, icon, subtitle, action, children, focus }: {
  title?: string; icon?: IconName; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; focus?: boolean;
}) {
  return <section className={`ad-card ${focus ? "ad-card-focus" : ""}`}>
    {title && <div className="ad-card-head"><div><h2>{icon && <Icon name={icon} />}{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}
    {children}
  </section>;
}

export function StatCard({ label, value, note, icon, to, tone }: { label: string; value: number | string; note?: string; icon: IconName; to?: string; tone?: "danger" | "warning" | "navy" | "success" }) {
  const body = <><div><p>{label}</p><span className="ad-stat-icon"><Icon name={icon} /></span></div><strong>{value}</strong>{note && <small>{note}</small>}</>;
  return to ? <Link className="ad-stat" data-tone={tone} to={to}>{body}</Link> : <div className="ad-stat" data-tone={tone}>{body}</div>;
}

export type Tone = "neutral" | "navy" | "solid" | "warning" | "danger" | "success";
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ad-badge ${tone === "neutral" ? "" : `ad-badge-${tone}`}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ad-empty"><Icon name="paw" className="ad-empty-icon" /><strong>{title}</strong>{children}</div>;
}

export function DataTable({ label, headers, children }: { label: string; headers: string[]; children: ReactNode }) {
  return <div className="ad-table-wrap" role="region" aria-label={label} tabIndex={0}>
    <table><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table>
  </div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="ad-field"><span>{label}</span>{children}</label>;
}
export function SearchInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <Field label={label}><input type="search" value={value} placeholder={placeholder ?? label} onChange={(event) => onChange(event.target.value)} /></Field>;
}
export function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: readonly (readonly [T, string])[] }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value as T)}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></Field>;
}
export function Chips<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: readonly (readonly [T, string, number?])[] }) {
  return <div className="ad-chips" role="group" aria-label={label}>
    {options.map(([key, text, count]) => <button key={key} type="button" className="ad-chip" aria-pressed={value === key} onClick={() => onChange(key)}>
      {text}{count !== undefined && <span>{count}</span>}
    </button>)}
  </div>;
}

// แบ่งหน้า: คืนรายการของหน้าปัจจุบัน + ตัวควบคุม (เปลี่ยนตัวกรองแล้วให้ key ใหม่เพื่อกลับหน้า 1)
export function usePaged<T>(items: T[], size = 8) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  const pager = items.length > size && <nav className="ad-pager" aria-label="แบ่งหน้า">
    <span>แสดง {(current - 1) * size + 1}–{Math.min(current * size, items.length)} จาก {items.length} รายการ</span>
    <span className="ad-row">
      <button type="button" className="ad-btn" disabled={current === 1} onClick={() => setPage(current - 1)}>ก่อนหน้า</button>
      <span aria-live="polite">หน้า {current}/{pages}</span>
      <button type="button" className="ad-btn" disabled={current === pages} onClick={() => setPage(current + 1)}>ถัดไป</button>
    </span>
  </nav>;
  return { rows: items.slice((current - 1) * size, current * size), pager, reset: () => setPage(1) };
}

export const matches = (query: string, ...fields: (string | number | undefined)[]) =>
  !query.trim() || fields.some((field) => String(field ?? "").toLowerCase().includes(query.trim().toLowerCase()));

export const notify = (message: string) => useToastStore.getState().show(message);

export function Thumb({ src, name, className = "ad-thumb" }: { src: string; name: string; className?: string }) {
  return <PetImage src={src} alt={`รูป ${name}`} className={className} />;
}

// ---------- เคส ----------
export const priorityChip: Record<Priority, [string, Tone]> = {
  urgent: ["!! ด่วน", "danger"], high: ["! ต้องติดตาม", "warning"], reminder: ["เฝ้าดู", "navy"], normal: ["ปกติ", "neutral"],
};
export const stageTone = (item: AdoptionCase): Tone =>
  item.stage === "COMPLETED" ? "success" : item.stage === "REJECTED" || item.stage === "CANCELLED" ? "neutral" : "navy";

// เหตุผลที่ต้องติดตาม + สิ่งที่ควรทำต่อ (ข้อความแสดงผล — กฎจริงอยู่ใน workflow.ts)
export function insight(item: AdoptionCase, now: number): { reason: string; action: string } {
  const policy = followUp(item, now);
  const idle = idleText(policy.hours);
  if (item.closed) return { reason: "ปิดเคสแล้ว", action: "ไม่ต้องดำเนินการ" };
  if (item.disputed) return { reason: "ข้อมูลการส่งมอบสองฝ่ายไม่ตรงกัน", action: "Admin ตรวจสอบข้อเท็จจริงกับทั้งสองฝ่าย" };
  switch (item.stage) {
    case "PENDING":
      if (policy.idle >= 72) return { reason: "เจ้าของไม่ตอบกลับนานเกิน 72 ชม.", action: "Admin ติดต่อเจ้าของโพสต์ · ถ้ายังเงียบ แนะนำผู้ขอดูน้องตัวอื่น" };
      if (policy.idle >= 48) return { reason: "เตือนเจ้าของ 2 ครั้งแล้ว (48 ชม.)", action: "ติดต่อเจ้าของโพสต์ให้ตอบรับหรือปฏิเสธ" };
      if (policy.idle >= 24) return { reason: "ระบบเตือนเจ้าของแล้ว (24 ชม.)", action: "รอเจ้าของตอบกลับ" };
      return { reason: "คำขอใหม่", action: "รอเจ้าของตอบกลับ" };
    case "ACCEPTED":
      return { reason: `ตอบรับแล้ว ${idle} แต่ยังไม่นัดส่งมอบ`, action: "ติดต่อทั้งสองฝ่าย ถามวันนัดส่งมอบ" };
    case "ARRANGING_HANDOVER":
      return policy.hours >= 168 ? { reason: "นัดส่งมอบนานเกิน 7 วัน", action: "สอบถามว่าส่งมอบแล้วหรือยัง" }
        : { reason: `กำลังนัดส่งมอบ (${idle})`, action: "รอรายงานการส่งมอบจากทั้งสองฝ่าย" };
    case "HANDOVER_REPORTED": {
      const { owner, applicant } = item.confirmations;
      if (!item.reports.owner || !item.reports.applicant) return { reason: "มีรายงานส่งมอบฝ่ายเดียว", action: "รออีกฝ่ายรายงาน" };
      if (!reportsMatch(item)) return { reason: "รายงานส่งมอบยังไม่ตรงกัน", action: "ตรวจรายงานของทั้งสองฝ่าย" };
      if (applicant && !owner) return { reason: `เจ้าของโพสต์ยังไม่ยืนยันการส่งมอบ (${idle})`, action: "ติดต่อเจ้าของโพสต์ให้ยืนยัน" };
      if (owner && !applicant) return { reason: "รอผู้ขอรับเลี้ยงยืนยัน", action: "รอผู้ขอรับเลี้ยงยืนยันการส่งมอบ" };
      return { reason: "แจ้งส่งมอบแล้ว", action: "รอทั้งสองฝ่ายยืนยัน" };
    }
    case "COMPLETED":
      return { reason: item.verified ? "ผู้ดูแลตรวจสอบแล้ว" : "ทั้งสองฝ่ายยืนยันการส่งมอบ", action: item.verified ? "ปิดเคสเมื่อพร้อม" : "ตรวจสอบและปิดเคส" };
    default:
      return { reason: stageLabel[item.stage], action: "ปิดเคสเมื่อพร้อม" };
  }
}

export function byUrgency(cases: AdoptionCase[]) {
  const now = Date.now();
  return cases.map((item) => ({ item, policy: followUp(item, now) }))
    .sort((a, b) => Number(isTerminal(a.item.stage) || a.item.closed) - Number(isTerminal(b.item.stage) || b.item.closed) ||
      priorityRank[b.policy.priority] - priorityRank[a.policy.priority] || b.policy.hours - a.policy.hours);
}

export function CaseRow({ data, item }: { data: PreviewData; item: AdoptionCase }) {
  const now = Date.now();
  const pet = petOf(data, item.petId);
  const policy = followUp(item, now);
  const next = insight(item, now);
  const [chip, tone] = item.disputed ? priorityChip.urgent : priorityChip[policy.priority];
  return <li>
    <Link to={`/admin/adoptions/${item.id}`} aria-label={`เปิดเคส ${item.id} ${pet?.name ?? ""}`} className={`ad-case ${item.disputed ? "ad-case-disputed" : ""}`}>
      <Thumb src={pet?.imageUrl ?? ""} name={pet?.name ?? ""} />
      <div className="ad-min0">
        <h3 className="ad-clamp">{pet?.name ?? "–"}</h3>
        <p className="ad-muted ad-small ad-clamp">เจ้าของ {userName(data, ownerOf(data, item))} · ผู้ขอ {userName(data, item.applicantId)}</p>
      </div>
      <div className="ad-row ad-case-status">
        {!isTerminal(item.stage) && !item.closed && <Badge tone={tone}>{chip}</Badge>}
        <Badge tone={stageTone(item)}>{stageLabel[item.stage]}</Badge>
        {item.flagged && <Badge tone="warning">มีธง</Badge>}
        <span className="ad-muted ad-small">เงียบ {idleText(policy.hours)}</span>
      </div>
      <p className="ad-next"><span className="ad-muted">{next.reason}</span><b>→ {next.action}</b></p>
      <Icon name="chevron" className="ad-chevron" />
    </Link>
  </li>;
}
