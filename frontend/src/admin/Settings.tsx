import { useState, type FormEvent } from "react";
import { useConfirmation } from "../components/ConfirmDialog";
import { usePreview, type Preferences } from "./store";
import { Card, Field, notify, PageHeader, Select } from "./ui";

export function Settings() {
  const data = usePreview();
  const [form, setForm] = useState<Preferences>(data.preferences);
  const { confirm, dialog } = useConfirmation();
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setForm((current) => ({ ...current, [key]: value }));
  const changed = JSON.stringify(form) !== JSON.stringify(data.preferences);

  function save(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim() || data.preferences.name;
    data.change("บันทึกการตั้งค่า", "ตั้งค่าพรีวิว", "ระบบ", () => ({ preferences: { ...form, name } }));
    setForm({ ...form, name });
    notify("บันทึกการตั้งค่าแล้ว (เฉพาะพรีวิวนี้)");
  }

  return <>
    <PageHeader title="ตั้งค่า">ใช้กับพรีวิวในเบราว์เซอร์นี้เท่านั้น · ไม่แก้ Environment Variables หรือระบบจริง</PageHeader>
    <form className="ad-stack" onSubmit={save}>
      <div className="ad-grid-2">
        <Card title="โปรไฟล์ผู้ดูแล (ตัวอย่าง)">
          <Field label="ชื่อที่แสดง"><input required maxLength={40} value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
          <p className="ad-muted ad-small ad-mt">ชื่อนี้ใช้ในประวัติกิจกรรมของการกระทำถัดไป</p>
        </Card>
        <Card title="การแจ้งเตือน">
          <label className="ad-check"><input type="checkbox" checked={form.reminders} onChange={(event) => set("reminders", event.target.checked)} />แสดงตัวอย่างแจ้งเตือน (กระดิ่งด้านบน)</label>
          <label className="ad-check"><input type="checkbox" checked={form.escalation} onChange={(event) => set("escalation", event.target.checked)} />รวมเคสเร่งด่วน (72 ชม. / ข้อพิพาท) ในการแจ้งเตือน</label>
        </Card>
        <Card title="การแสดงผล">
          <Select label="ความหนาแน่นของตาราง" value={form.density} onChange={(value) => set("density", value)} options={[["regular", "ปกติ"], ["compact", "กะทัดรัด"]]} />
        </Card>
        <Card title="หน้าภาพรวม">
          <label className="ad-check"><input type="checkbox" checked={form.trends} onChange={(event) => set("trends", event.target.checked)} />แสดงกราฟแนวโน้ม</label>
          <label className="ad-check"><input type="checkbox" checked={form.showQuickActions} onChange={(event) => set("showQuickActions", event.target.checked)} />แสดงทางลัด</label>
        </Card>
      </div>
      <Card title="ค่าพรีวิว" subtitle="เลื่อนเวลาจำลองเพื่อดูเคสข้ามเกณฑ์ 24 / 48 / 72 ชม. โดยไม่เปลี่ยนข้อมูล">
        <Select label="เลื่อนเวลาไปข้างหน้า" value={String(form.timeShift)} onChange={(value) => set("timeShift", Number(value))}
          options={[["0", "เวลาปัจจุบัน"], ["24", "+24 ชั่วโมง"], ["48", "+48 ชั่วโมง"], ["72", "+72 ชั่วโมง"]]} />
      </Card>
      <div className="ad-row">
        <button type="submit" className="ad-btn ad-btn-primary" disabled={!changed}>บันทึกการตั้งค่า</button>
        <button type="button" className="ad-btn" disabled={!changed} onClick={() => setForm(data.preferences)}>ยกเลิกการแก้ไข</button>
        <button type="button" className="ad-btn ad-btn-danger ad-right" onClick={() => confirm({
          title: "รีเซ็ตข้อมูลจำลองทั้งหมด", description: "คืนผู้ใช้ สัตว์ เคส ประกาศ ประวัติ และการตั้งค่าเป็นค่าเริ่มต้น", label: "รีเซ็ต", danger: true,
          action: () => { data.reset(); setForm(usePreview.getState().preferences); notify("รีเซ็ตข้อมูลจำลองแล้ว"); },
        })}>รีเซ็ตข้อมูลจำลอง</button>
      </div>
    </form>
    {dialog}
  </>;
}
