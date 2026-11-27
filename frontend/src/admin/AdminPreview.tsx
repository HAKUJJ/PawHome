// หน้า Admin — ข้อมูลจริงจาก Backend เท่านั้น
// ต้องผ่าน GET /api/admin/me ก่อนแสดงข้อมูลใด ๆ (Backend ตรวจสิทธิ์ทุก request)
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import { Dialog } from "../components/Dialog";
import PawLogo from "../components/PawLogo";
import Toaster from "../components/Toaster";
import { useAuthStore } from "../stores/useAuthStore";
import { AdoptionList, CaseDetail } from "./Adoptions";
import { Announcements } from "./Content";
import { Dashboard } from "./Dashboard";
import { Users } from "./People";
import { Pets } from "./Pets";
import { clearAdmin, loadAdmin } from "./real";
import { petOf, usePreview, userName } from "./store";
import { Icon, matches, type IconName } from "./ui";
import { followUp, isTerminal } from "./workflow";
import "./admin.css";

const navigation: { group: string; items: { path: string; label: string; icon: IconName }[] }[] = [
  { group: "ภาพรวม", items: [{ path: "", label: "ภาพรวม", icon: "grid" }] },
  { group: "งานจัดการ", items: [
    { path: "pets", label: "จัดการสัตว์เลี้ยง", icon: "paw" },
    { path: "adoptions", label: "คำขอรับเลี้ยง", icon: "heart" },
    { path: "users", label: "ผู้ใช้งาน", icon: "users" },
    { path: "announcements", label: "ประชาสัมพันธ์", icon: "megaphone" },
  ] },
];
const allItems = navigation.flatMap((section) => section.items);

function useAttention() {
  const data = usePreview();
  const now = Date.now();
  const open = data.cases.filter((item) => !isTerminal(item.stage) && !item.closed).map((item) => ({ item, policy: followUp(item, now) }));
  return { data, counts: { adoptions: open.filter(({ policy }) => policy.required).length, pets: data.pets.filter((pet) => pet.visibility === "review").length } as Record<string, number> };
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
  return <Link to="/admin" className="ad-brand"><span><PawLogo className="ad-brand-paw" /></span><span>PawHome<small>พื้นที่ผู้ดูแล</small></span></Link>;
}

// Real Mode: ยังไม่ยืนยันสิทธิ์ → ไม่แสดง layout/ข้อมูลใด ๆ
export function Component() {
  const status = usePreview((state) => state.status);
  const token = useAuthStore((state) => state.token);

  // ล็อกอิน / ออกจากระบบ / แท็บอื่นเปลี่ยน session (useAuthStore rehydrate จาก storage event) → ตรวจสิทธิ์ใหม่
  useEffect(() => {
    if (token) void loadAdmin();
    else clearAdmin("unauthorized");
  }, [token]);

  if (status !== "ready") return <AdminGate />;
  return <AdminLayout />;
}

function AdminGate() {
  const { status, error } = usePreview();
  const location = useLocation();
  const content = {
    checking: <p role="status" className="ad-muted">กำลังตรวจสอบสิทธิ์ผู้ดูแล…</p>,
    unauthorized: <>
      <h1>เข้าสู่ระบบผู้ดูแล</h1>
      <p className="ad-muted">กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับสิทธิ์ผู้ดูแล</p>
      <Link className="ad-btn ad-btn-primary" to={`/login?redirect=${encodeURIComponent(location.pathname)}`}>เข้าสู่ระบบ</Link>
    </>,
    forbidden: <>
      <h1>ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="ad-muted">{error || "บัญชีนี้ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแล"}</p>
      <Link className="ad-btn" to="/">กลับเว็บไซต์ PawHome</Link>
    </>,
    error: <>
      <h1>เชื่อมต่อระบบไม่สำเร็จ</h1>
      <p className="ad-muted">{error}</p>
      <button type="button" className="ad-btn ad-btn-primary" onClick={() => void loadAdmin()}>ลองใหม่</button>
    </>,
    ready: null,
  }[status];
  return <div className="ad ad-gate"><main className="ad-card ad-stack">
    <span className="ad-brand"><span><PawLogo className="ad-brand-paw" /></span><span>PawHome<small>พื้นที่ผู้ดูแล</small></span></span>
    {content}
  </main></div>;
}

function AdminLayout() {
  const location = useLocation();
  const [open, setOpen] = useState<"menu" | "search" | null>(null);
  const [query, setQuery] = useState("");
  const { data } = useAttention();
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
    document.title = `${page?.label ?? "ผู้ดูแล"} | PawHome Admin`;
    return () => { document.title = previous; };
  }, [page]);

  return <div className="ad">
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
          <span className="ad-profile"><span className="ad-avatar" aria-hidden="true">{data.preferences.name.slice(0, 1)}</span><span>{data.preferences.name}{data.me?.role === "SUPER_ADMIN" ? " (ผู้ดูแลสูงสุด)" : ""}</span></span>
        </div>
      </header>
      <main id="admin-content" className="ad-main" tabIndex={-1}>
        <p className="ad-env ad-env-real"><strong>ข้อมูลจริง</strong>ทุกการกระทำมีผลกับเว็บไซต์ PawHome ทันที</p>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="pets" element={<Pets />} />
          <Route path="adoptions" element={<AdoptionList />} />
          <Route path="adoptions/:id" element={<CaseDetail />} />
          <Route path="users" element={<Users />} />
          <Route path="announcements" element={<Announcements />} />
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
  </div>;
}

function Search({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="ad-field"><span>ชื่อเมนู ชื่อสัตว์ ชื่อคน หรือรหัสเคส</span><input type="search" autoFocus value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
