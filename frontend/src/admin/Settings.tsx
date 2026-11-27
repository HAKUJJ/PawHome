import { useState, type FormEvent } from "react";
import { usePreview, type Preferences } from "./store";
import { Card, Field, notify, PageHeader, Select } from "./ui";

export function Settings() {
  const data = usePreview();
  const [form, setForm] = useState<Preferences>(data.preferences);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setForm((current) => ({ ...current, [key]: value }));
  const changed = JSON.stringify(form) !== JSON.stringify(data.preferences);

  function save(event: FormEvent) {
    event.preventDefault();
    usePreview.setState({ preferences: form });
    notify("บันทึกการตั้งค่าแล้ว");
  }

  return <>
    <PageHeader title="ตั้งค่า">การแสดงผลในเบราว์เซอร์นี้เท่านั้น · สิทธิ์และบัญชีจัดการที่ Backend</PageHeader>
    <form className="ad-stack" onSubmit={save}>
      <div className="ad-grid-2">
        <Card title="บัญชีผู้ดูแล">
          <Field label="ชื่อที่แสดง"><input value={form.name} disabled /></Field>
          <p className="ad-muted ad-small ad-mt">{data.me?.role === "SUPER_ADMIN" ? "ผู้ดูแลสูงสุด" : "ผู้ดูแล"} · ชื่อมาจากบัญชี PawHome</p>
        </Card>
        <Card title="การแสดงผล">
          <Select label="ความหนาแน่นของตาราง" value={form.density} onChange={(value) => set("density", value)} options={[["regular", "ปกติ"], ["compact", "กะทัดรัด"]]} />
        </Card>
        <Card title="หน้าภาพรวม">
          <label className="ad-check"><input type="checkbox" checked={form.trends} onChange={(event) => set("trends", event.target.checked)} />แสดงกราฟแนวโน้ม</label>
          <label className="ad-check"><input type="checkbox" checked={form.showQuickActions} onChange={(event) => set("showQuickActions", event.target.checked)} />แสดงทางลัด</label>
        </Card>
      </div>
      <div className="ad-row">
        <button type="submit" className="ad-btn ad-btn-primary" disabled={!changed}>บันทึกการตั้งค่า</button>
        <button type="button" className="ad-btn" disabled={!changed} onClick={() => setForm(data.preferences)}>ยกเลิกการแก้ไข</button>
      </div>
    </form>
  </>;
}
