import { useState } from "react";
import { Dialog } from "./Dialog";

export interface Confirmation {
  title: string;
  description: string;
  label: string; // ข้อความปุ่มยืนยัน
  danger?: boolean;
  action: () => void;
}

// แทน window.confirm: ปุ่ม "กลับ" ได้โฟกัสก่อน (กด Enter โดยไม่ตั้งใจจะไม่ยืนยัน) · Escape = ยกเลิก
export function ConfirmDialog({ title, description, label, danger, action, onClose }: Confirmation & { onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="mb-5 text-muted">{description}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" autoFocus onClick={onClose} className="min-h-11 rounded-xl border border-line px-4 font-semibold hover:bg-navy-soft">กลับ</button>
        <button
          type="button"
          onClick={() => {
            onClose();
            action();
          }}
          className={`min-h-11 rounded-xl px-4 font-semibold text-white ${danger ? "bg-danger" : "bg-navy hover:bg-navy-dark"}`}
        >
          {label}
        </button>
      </div>
    </Dialog>
  );
}

// const { confirm, dialog } = useConfirmation(); → confirm({...}) แล้ววาง {dialog} ไว้ใน JSX
export function useConfirmation() {
  const [confirmation, confirm] = useState<Confirmation | null>(null);
  return { confirm, dialog: confirmation && <ConfirmDialog {...confirmation} onClose={() => confirm(null)} /> };
}
