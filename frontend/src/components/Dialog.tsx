import { useEffect, useId, useRef, type ReactNode } from "react";

// หน้าต่าง modal จาก <dialog> ของเบราว์เซอร์: Escape ปิดได้ · โฟกัสวนอยู่ในหน้าต่าง · พื้นหลังกดไม่ได้ · ปิดแล้วโฟกัสกลับปุ่มเดิม
// drawer = เลื่อนชิดขวา ใช้กับรายละเอียดหรือเมนูมือถือ
export function Dialog({ title, children, onClose, drawer = false }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={`fixed max-w-none overflow-y-auto bg-white p-5 text-ink shadow-xl backdrop:bg-navy-dark/45 [overflow-wrap:anywhere] ${
        drawer
          ? "inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(26rem,100%)] rounded-l-2xl"
          : "inset-0 m-auto max-h-[90dvh] w-[min(36rem,calc(100%-1.5rem))] rounded-2xl"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="ปิดหน้าต่าง" className="size-11 shrink-0 rounded-xl text-2xl leading-none hover:bg-navy-soft">×</button>
      </div>
      {children}
    </dialog>
  );
}
