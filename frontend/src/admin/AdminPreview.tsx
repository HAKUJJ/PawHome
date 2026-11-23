// Admin Preview — โหลดเฉพาะเมื่อ import.meta.env.DEV && VITE_ADMIN_PREVIEW === "true" (ดู router.tsx)
// ข้อมูลทั้งหมดเป็น Mock ในหน่วยความจำ ไม่เรียก API และไม่มีสิทธิ์ผู้ดูแลจริง
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import { Dialog } from "../components/Dialog";
import PawLogo from "../components/PawLogo";
import Toaster from "../components/Toaster";
import { AdoptionList, CaseDetail } from "./Adoptions";
import { Announcements } from "./Content";
import { Dashboard } from "./Dashboard";
import { AuditLogs, Users } from "./People";
import { Pets } from "./Pets";
import { Reports } from "./Reports";
import { Settings } from "./Settings";
import { idleText, petOf, previewNow, usePreview, userName } from "./store";
import { Icon, matches, type IconName } from "./ui";
import { followUp, isTerminal } from "./workflow";
import { WorkflowPreview } from "./WorkflowPreview";
import "./admin.css";

const navigation: { group: string; items: { path: string; label: string; icon: IconName }[] }[] = [
  { group: "ภาพรวม", items: [{ path: "", label: "ภาพรวม", icon: "grid" }] },
  { group: "งานจัดการ", items: [
    { path: "pets", label: "จัดการสัตว์เลี้ยง", icon: "paw" },
    { path: "adoptions", label: "คำขอรับเลี้ยง", icon: "heart" },
    { path: "workflow-preview", label: "จำลองขั้นตอนรับเลี้ยง", icon: "flow" }, // เมนูนี้มีเฉพาะ Development Preview
    { path: "users", label: "ผู้ใช้งาน", icon: "users" },
    { path: "announcements", label: "ประชาสัมพันธ์", icon: "megaphone" },
  ] },
  { group: "ระบบ", items: [
    { path: "reports", label: "รายงาน", icon: "chart" },
    { path: "audit-logs", label: "ประวัติกิจกรรม", icon: "clock" },
    { path: "settings", label: "ตั้งค่า", icon: "settings" },
  ] },
];
const allItems = navigation.flatMap((section) => section.items);

function useAttention() {
  const data = usePreview();
  const now = previewNow(data);
  const open = data.cases.filter((item) => !isTerminal(item.stage) && !item.closed).map((item) => ({ item, policy: followUp(item, now) }));
  const reminders = data.preferences.reminders
    ? open.filter(({ policy }) => policy.priority !== "normal" && (data.preferences.escalation || policy.priority !== "urgent")) : [];
  return { data, reminders, counts: { adoptions: open.filter(({ policy }) => policy.required).length, pets: data.pets.filter((pet) => pet.visibility === "review").length } as Record<string, number> };
}

function Navigation() {
  const { counts } = useAttention();
  return <nav aria-label="เมนูผู้ดูแล" className="ad-nav">
    {navigation.map(({ group, items }) => <div key={group}>
      <p>{group}</p>
      {items.map(({ path, label, icon }) => <NavLink key={path} to={path ? `/admin/${path}` : "/admin"} end={!path}>
        {icon === "paw" ? <PawLogo className="ad-nav-paw" /> : <Icon name={icon} />}<span>{label}</span>
        {counts[path] > 0 && <span className="ad-nav-count" aria-label={`${counts[path]} รายการรอดำเนินการ`}>{counts[path]}</span>}
      </NavLink>)}
    </div>)}
    <Link className="ad-back" to="/"><Icon name="home" />กลับเว็บไซต์ PawHome</Link>
  </nav>;
}

function Brand() {
  return <Link to="/admin" className="ad-brand"><span><PawLogo className="ad-brand-paw" /></span><span>PawHome<small>พื้นที่ผู้ดูแล · พรีวิว</small></span></Link>;
}

export function Component() {
  const location = useLocation();
  const [open, setOpen] = useState<"menu" | "search" | "notifications" | null>(null);
  const [query, setQuery] = useState("");
  const { data, reminders } = useAttention();
  const segment = location.pathname.split("/")[2] ?? "";
  const page = allItems.find((item) => item.path === segment);
  const caseResults = query.trim() ? data.cases.filter((item) => {
    const pet = petOf(data, item.petId);
    return matches(query, item.id, pet?.name, userName(data, item.applicantId), userName(data, pet?.ownerId ?? ""));
  }).slice(0, 6) : [];
  const menuResults = query.trim() ? allItems.filter((item) => matches(query, item.label)) : [];

  useEffect(() => {
    setOpen(null);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${page?.label ?? "ผู้ดูแล"} | PawHome Admin Preview`;
    return () => { document.title = previous; };
  }, [page]);

  return <div className={`ad ${data.preferences.density === "compact" ? "ad-compact" : ""}`}>
    <a href="#admin-content" className="ad-skip">ข้ามไปยังเนื้อหา</a>
    <aside className="ad-sidebar"><Brand /><Navigation /></aside>
    <div className="ad-workspace">
      <header className="ad-top">
        <button type="button" className="ad-icon-btn ad-menu-btn" aria-haspopup="dialog" aria-label="เปิดเมนูผู้ดูแล" onClick={() => setOpen("menu")}><Icon name="menu" /></button>
        <Link to="/admin" className="ad-mobile-brand"><PawLogo className="ad-mobile-paw" />PawHome</Link>
        <nav className="ad-crumbs" aria-label="เส้นทางหน้า">
          <Link to="/admin">ผู้ดูแลระบบ</Link><Icon name="chevron" className="ad-crumb-sep" />
          <span aria-current="page">{segment === "adoptions" && location.pathname.split("/")[3] ? "รายละเอียดเคส" : page?.label ?? "ไม่พบหน้า"}</span>
        </nav>
        <div className="ad-top-actions">
          <button type="button" className="ad-search" aria-haspopup="dialog" aria-label="ค้นหา" onClick={() => { setQuery(""); setOpen("search"); }}>
            <Icon name="search" /><span>ค้นหาน้อง / เจ้าของ / เคส…</span>
          </button>
          <button type="button" className="ad-icon-btn" aria-haspopup="dialog" aria-label={`การแจ้งเตือนจำลอง ${reminders.length} รายการ`} onClick={() => setOpen("notifications")}>
            <Icon name="bell" />{reminders.length > 0 && <span className="ad-dot" />}
          </button>
          <Link to="/admin/settings" className="ad-profile" aria-label="ตั้งค่าโปรไฟล์ผู้ดูแล"><span className="ad-avatar" aria-hidden="true">{data.preferences.name.slice(0, 1)}</span><span>{data.preferences.name} (พรีวิว)</span></Link>
        </div>
      </header>
      <main id="admin-content" className="ad-main" tabIndex={-1}>
        <p className="ad-env"><strong>โหมดตัวอย่าง</strong>ข้อมูลจำลองในเบราว์เซอร์นี้เท่านั้น · ไม่เชื่อมต่อระบบจริง · รีเฟรชแล้วข้อมูลกลับเป็นค่าเริ่มต้น</p>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="pets" element={<Pets />} />
          <Route path="adoptions" element={<AdoptionList />} />
          <Route path="adoptions/:id" element={<CaseDetail />} />
          <Route path="workflow-preview" element={<WorkflowPreview />} />
          <Route path="users" element={<Users />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<section className="ad-card"><h1 className="ad-sr">ไม่พบหน้า</h1><p>ไม่พบหน้าผู้ดูแลนี้</p><Link className="ad-btn-link" to="/admin">กลับหน้าภาพรวม</Link></section>} />
        </Routes>
      </main>
    </div>
    <Toaster />

    {open === "menu" && <Dialog title="เมนูผู้ดูแล" drawer onClose={() => setOpen(null)}>
      <div className="ad-drawer-nav" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(null); }}><Navigation /></div>
    </Dialog>}
    {open === "search" && <Dialog title="ค้นหา" onClose={() => setOpen(null)}>
      <div className="ad-stack">
        <Search value={query} onChange={setQuery} />
        <ul className="ad-list">
          {menuResults.map((item) => <li key={item.path}><Link className="ad-btn-link" onClick={() => setOpen(null)} to={item.path ? `/admin/${item.path}` : "/admin"}>เมนู · {item.label}</Link></li>)}
          {caseResults.map((item) => <li key={item.id}><Link className="ad-btn-link" onClick={() => setOpen(null)} to={`/admin/adoptions/${item.id}`}>{petOf(data, item.petId)?.name} · {item.id}</Link></li>)}
          {query.trim() && !menuResults.length && !caseResults.length && <li className="ad-muted">ไม่พบผลการค้นหา</li>}
        </ul>
      </div>
    </Dialog>}
    {open === "notifications" && <Dialog title="การแจ้งเตือนจำลอง" onClose={() => setOpen(null)}>
      {!reminders.length ? <p className="ad-muted">ไม่มีการแจ้งเตือนในขณะนี้</p> : <ul className="ad-list">{reminders.map(({ item, policy }) =>
        <li key={item.id}><Link className="ad-btn-link" onClick={() => setOpen(null)} to={`/admin/adoptions/${item.id}`}>{petOf(data, item.petId)?.name} · {item.id}</Link><span className="ad-muted ad-small">เงียบ {idleText(policy.hours)}</span></li>)}</ul>}
      <p className="ad-muted ad-small ad-mt">ตัวอย่างเท่านั้น ไม่มีการส่งอีเมลหรือ SMS จริง</p>
    </Dialog>}
  </div>;
}

function Search({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="ad-field"><span>ชื่อเมนู ชื่อสัตว์ ชื่อคน หรือรหัสเคส</span><input type="search" autoFocus value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
