import { adoptionLabel, type AdoptionRequest } from "../types/adoption";

// ป้ายสถานะคำขอรับเลี้ยง: ใช้ขั้นตอนละเอียด (stage) ถ้า Backend ส่งมา ไม่งั้นใช้ status เดิม
export default function AdoptionBadge({ request }: { request: Pick<AdoptionRequest, "status" | "stage" | "legacyReview"> }) {
  const stage = request.legacyReview ? undefined : request.stage;
  const tone = stage === "COMPLETED" ? "bg-navy text-white"
    : stage && ["ACCEPTED", "ARRANGING_HANDOVER", "HANDOVER_REPORTED"].includes(stage) ? "bg-navy-soft text-navy"
    : request.status === "APPROVED" ? "bg-navy text-white"
    : request.status === "REJECTED" ? "bg-danger/10 text-danger"
    : request.status === "CANCELLED" ? "bg-ground text-muted"
    : "bg-sand text-ink";
  return (
    <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${tone}`}>
      {adoptionLabel(request)}
    </span>
  );
}
