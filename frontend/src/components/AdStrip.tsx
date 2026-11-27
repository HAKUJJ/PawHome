import { Link } from "react-router";
import { homePromos } from "../data/promos";
import { usePublicAnnouncements } from "../hooks/useSite";

// ข่าวสาร / ร่วมช่วยเหลือ / ผู้สนับสนุน แบบแถบเล็ก บนรายการน้องในหน้าแรก — กดแล้วไปหน้ารายละเอียด
// ใช้ประกาศที่เผยแพร่จากหน้าผู้ดูแล (GET /api/announcements) · ยังไม่มีประกาศ / Backend รุ่นเดิม / โหลดไม่สำเร็จ → การ์ดเดิมใน data/promos.ts
// ประกาศ 3 รายการเดิมชี้ไป path เดิม (/announcements/rabies-vaccine ฯลฯ) จึงไม่เปลี่ยน URL
export default function AdStrip() {
  const { data } = usePublicAnnouncements();
  const cards = data?.length
    ? data.slice(0, 3).map((a, index) => ({ id: String(a.id), path: a.destination, category: a.category, title: a.title, cta: a.cta || "ดูรายละเอียด", isDemo: a.isDemo, tone: index === 0 ? "navy" : "white" }))
    : homePromos;
  return (
    <section aria-label="ข่าวสารและผู้สนับสนุน" className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
      {cards.map((promo) => (
        <Link
          key={promo.id}
          to={promo.path}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 min-h-16 border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
            promo.tone === "navy"
              ? "bg-navy text-white border-navy hover:bg-navy-dark"
              : "bg-white text-ink border-line hover:border-navy"
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${promo.tone === "navy" ? "text-white/70" : "text-navy"}`}>
              {promo.category}
              {promo.isDemo && " · ตัวอย่าง"}
            </p>
            <p className="font-semibold truncate">{promo.title}</p>
          </div>
          <span className="text-sm font-semibold whitespace-nowrap">{promo.cta} →</span>
        </Link>
      ))}
    </section>
  );
}
