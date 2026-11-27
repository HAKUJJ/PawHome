import { useState } from "react";
import { Link } from "react-router";
import { speciesLabel, type Species } from "../types/pet";
import { metrics } from "./Dashboard";
import { usePreview, type PreviewData } from "./store";
import { Card, Icon, PageHeader, Select, StatCard } from "./ui";
import { followUp, HOUR, stageLabel, type Stage } from "./workflow";

const ranges = [["30", "30 วันล่าสุด"], ["90", "90 วันล่าสุด"], ["365", "1 ปี"], ["all", "ทั้งหมด"]] as const;
type Range = (typeof ranges)[number][0];

// สรุปทั้งหมดจากข้อมูลชุดเดียวใน store — แดชบอร์ดใช้ metrics() ตัวเดียวกัน ตัวเลขจึงไม่ขัดกัน
export function report(data: PreviewData, range: Range) {
  const now = Date.now();
  const from = range === "all" ? 0 : now - Number(range) * 24 * HOUR;
  const cases = data.cases.filter((item) => item.createdAt >= from);
  const count = <K extends string>(keys: K[]) => keys.map((key) => [key, 0] as [K, number]);
  const bump = <K extends string>(rows: [K, number][], key: K) => { const row = rows.find(([name]) => name === key); if (row) row[1] += 1; else rows.push([key, 1]); };
  const byStage = count(Object.keys(stageLabel) as Stage[]);
  cases.forEach((item) => bump(byStage, item.stage));
  const bySpecies = count(Object.keys(speciesLabel) as Species[]);
  const byProvince: [string, number][] = [];
  data.pets.forEach((pet) => { bump(bySpecies, pet.species); bump(byProvince, pet.province); });
  const months = new Map<string, { requests: number; completed: number }>();
  const monthKey = (time: number) => new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }).format(time);
  [...cases].sort((a, b) => a.createdAt - b.createdAt).forEach((item) => {
    const entry = months.get(monthKey(item.createdAt)) ?? { requests: 0, completed: 0 };
    entry.requests += 1;
    months.set(monthKey(item.createdAt), entry);
  });
  data.cases.filter((item) => item.completedAt !== undefined && item.completedAt >= from).forEach((item) => {
    const key = monthKey(item.completedAt!);
    const entry = months.get(key) ?? { requests: 0, completed: 0 };
    entry.completed += 1;
    months.set(key, entry);
  });
  return {
    total: cases.length,
    completed: data.cases.filter((item) => item.completedAt !== undefined && item.completedAt >= from).length,
    overdue: cases.filter((item) => followUp(item, now).overdue).length,
    byStage, bySpecies, byProvince: byProvince.sort((a, b) => b[1] - a[1]), months: [...months],
  };
}

function Bars<K extends string>({ title, rows, label, link }: { title: string; rows: [K, number][]; label: (key: K) => string; link?: (key: K) => string }) {
  const [active, setActive] = useState<K | null>(null);
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return <Card title={title}>
    <div className="ad-bars">{rows.map(([key, value]) => <button key={key} type="button" aria-pressed={active === key} onClick={() => setActive(active === key ? null : key)}
      aria-label={`${label(key)} ${value}`}>
      <span className="ad-clamp">{label(key)}</span><span className="ad-bar"><span style={{ width: `${(value / max) * 100}%` }} /></span><b>{value}</b>
    </button>)}</div>
    {active && <p className="ad-callout ad-mt" role="status"><b>{label(active)}: {rows.find(([key]) => key === active)?.[1]} รายการ</b>
      {link && <Link className="ad-btn-link" to={link(active)}>เปิดรายการ →</Link>}</p>}
  </Card>;
}

export function Reports() {
  const data = usePreview();
  const [range, setRange] = useState<Range>("90");
  const result = report(data, range);
  const stats = metrics(data);
  const peak = Math.max(1, ...result.months.map(([, entry]) => entry.requests));

  function download() {
    const rows = [["หัวข้อ", "จำนวน"], ["ช่วงเวลา", ranges.find(([key]) => key === range)![1]], ["คำขอในช่วงนี้", result.total], ["รับเลี้ยงสำเร็จ", result.completed], ["เคสเกินเวลา", result.overdue],
      ...result.byStage.map(([key, value]) => [`สถานะ: ${stageLabel[key]}`, value]), ...result.bySpecies.map(([key, value]) => [`ชนิด: ${speciesLabel[key]}`, value]),
      ...result.byProvince.map(([key, value]) => [`จังหวัด: ${key}`, value])];
    const csv = "﻿" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: "pawhome-preview-report.csv" });
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <>
    <PageHeader title="รายงาน" action={<button type="button" className="ad-btn ad-btn-primary" onClick={download}><Icon name="download" />ดาวน์โหลด CSV</button>}>
      สรุปจากข้อมูลจริงชุดเดียวกับหน้าภาพรวม
    </PageHeader>
    <div className="ad-filters"><Select label="ช่วงเวลา" value={range} onChange={setRange} options={ranges} /></div>
    <div className="ad-stats">
      <StatCard label="คำขอในช่วงนี้" value={result.total} icon="clipboard" to="/admin/adoptions" />
      <StatCard label="รับเลี้ยงสำเร็จในช่วงนี้" value={result.completed} note={`ทั้งหมด ${stats.completed} เคส`} icon="check" to="/admin/adoptions?stage=COMPLETED" />
      <StatCard label="เคสเกินเวลา" value={result.overdue} note={`ทั้งระบบ ${stats.overdue} เคส`} icon="history" to="/admin/adoptions?filter=overdue" />
      <StatCard label="รอส่งมอบ / รอยืนยัน" value={stats.handover} icon="handover" to="/admin/adoptions?filter=handover" />
    </div>
    <Card title="แนวโน้มการรับเลี้ยงรายเดือน" subtitle="แท่ง = คำขอใหม่ · ตัวเลขล่าง = รับเลี้ยงสำเร็จ">
      {result.months.length ? <div className="ad-columns" role="img" aria-label={result.months.map(([month, entry]) => `${month}: คำขอ ${entry.requests} สำเร็จ ${entry.completed}`).join(", ")}>
        {result.months.map(([month, entry]) => <div key={month}><b>{entry.requests}</b><i style={{ height: `${Math.max(3, (entry.requests / peak) * 100)}%` }} /><span>{month}</span><span>สำเร็จ {entry.completed}</span></div>)}
      </div> : <p className="ad-muted">ไม่มีคำขอในช่วงเวลานี้</p>}
    </Card>
    <div className="ad-grid-2">
      <Bars title="สถานะคำขอ" rows={result.byStage} label={(key) => stageLabel[key]} link={(key) => `/admin/adoptions?stage=${key}`} />
      <Bars title="สัตว์ตามชนิด" rows={result.bySpecies} label={(key) => speciesLabel[key]} />
    </div>
    <Bars title="สัตว์ตามจังหวัด" rows={result.byProvince} label={(key) => key} />
  </>;
}
