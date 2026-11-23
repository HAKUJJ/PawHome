import { useState } from "react";
import PawLogo from "./PawLogo";

// แสดงรูปน้อง ถ้าไม่มีลิงก์หรือโหลดรูปไม่ได้ จะแสดงกล่องรูปเท้าแทน (ไม่ใช้รูปสัตว์ตัวอื่นแทน)
// จำ src ที่โหลดไม่ได้ไว้ ถ้าเปลี่ยนเป็นรูปใหม่จะลองโหลดใหม่
export default function PetImage({ src, alt, className = "", showMissingLabel = false }: {
  src: string;
  alt: string;
  className?: string;
  showMissingLabel?: boolean;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string>();

  if (!src || src === brokenSrc) {
    return (
      <div role="img" aria-label={`${alt} (ยังไม่มีรูปภาพ)`} className={`bg-sand flex flex-col items-center justify-center gap-2 ${className}`}>
        <PawLogo className="size-14 fill-white/70" />
        {showMissingLabel && <span aria-hidden="true" className="font-medium text-navy">ยังไม่มีรูปภาพ</span>}
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setBrokenSrc(src)} className={`object-cover ${className}`} />;
}
