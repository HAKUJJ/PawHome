import { usePetAdoptions, useReviewAdoption } from "../hooks/useAdoptions";
import { useHandoverEnabled } from "../hooks/useSite";
import { housingLabel, type AdoptionRequest } from "../types/adoption";
import { timeAgo } from "../types/pet";
import AdoptionBadge from "./AdoptionBadge";
import { useConfirmation } from "./ConfirmDialog";
import HandoverPanel from "./HandoverPanel";
import { ErrorBox } from "./States";

// เจ้าของโพสต์ดูคำขอรับเลี้ยงทั้งหมดของน้องตัวนี้ แล้วกด "ตอบรับ/อนุมัติ" หรือ "ไม่ผ่าน"
// เปิดขั้นตอนส่งมอบ: ตอบรับ → นัดส่งมอบ → รายงานสองฝ่าย → ยืนยัน (น้องได้บ้านเมื่อยืนยันครบ)
export default function OwnerRequests({ petId }: { petId: number }) {
  const { data: requests, isLoading, isError, error, refetch } = usePetAdoptions(petId, true);

  return (
    <section className="bg-white rounded-2xl border border-line p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display font-semibold text-lg">คำขอรับเลี้ยง</h2>
        {requests && <span className="text-sm text-muted">{requests.length} คำขอ</span>}
      </div>

      {isLoading && <div aria-hidden="true" className="h-24 rounded-xl bg-ground animate-pulse" />}
      {isError && <ErrorBox message={error?.message} onRetry={() => refetch()} />}
      {requests && requests.length === 0 && <p className="text-muted">ยังไม่มีใครขอรับเลี้ยง แชร์โพสต์นี้ให้เพื่อนช่วยกันดูได้นะ</p>}

      <ul className="flex flex-col gap-3">
        {requests?.map((r) => (
          <RequestItem key={r.id} request={r} />
        ))}
      </ul>
    </section>
  );
}

function RequestItem({ request }: { request: AdoptionRequest }) {
  const review = useReviewAdoption();
  const { confirm, dialog } = useConfirmation();
  const handoverEnabled = useHandoverEnabled();
  const stage = request.stage ?? request.status;

  const approve = () => confirm({
    title: `${handoverEnabled ? "ตอบรับ" : "อนุมัติ"}คำขอของ ${request.userName}`,
    description: handoverEnabled
      ? "ตอบรับเพื่อนัดส่งมอบน้อง (ยังไม่ถือว่ารับเลี้ยงสำเร็จ) · น้องจะได้บ้านเมื่อทั้งสองฝ่ายยืนยันการส่งมอบ"
      : "ให้ผู้ขอรายนี้รับน้องไปเลี้ยง · คำขออื่นที่รออยู่จะไม่ผ่านอัตโนมัติ",
    label: handoverEnabled ? "ตอบรับ" : "อนุมัติ",
    action: () => review.mutate({ id: request.id, status: "APPROVED" }),
  });
  const reject = () => confirm({
    title: `ไม่ผ่านคำขอของ ${request.userName}`,
    description: "ผู้ขอจะเห็นว่าคำขอนี้ไม่ผ่าน และเปลี่ยนกลับไม่ได้",
    label: "ไม่ผ่าน",
    danger: true,
    action: () => review.mutate({ id: request.id, status: "REJECTED" }),
  });

  return (
    <li className="rounded-xl border border-line p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{request.userName}</span>
        <AdoptionBadge request={request} />
        <span className="text-sm text-muted ml-auto">{timeAgo(request.createdAt)}</span>
      </div>
      <p className="text-sm text-muted">
        โทร{" "}
        <a href={`tel:${request.phone}`} className="text-navy font-medium underline">
          {request.phone}
        </a>{" "}
        · {housingLabel[request.housing]}
      </p>
      <p className="whitespace-pre-line">{request.message}</p>

      {stage === "PENDING" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={approve}
            disabled={review.isPending}
            className="min-h-11 px-5 rounded-xl bg-navy text-white font-semibold disabled:opacity-50"
          >
            {handoverEnabled ? "ตอบรับ" : "อนุมัติ"}
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={review.isPending}
            className="min-h-11 px-5 rounded-xl border border-line font-semibold hover:border-danger hover:text-danger disabled:opacity-50"
          >
            ไม่ผ่าน
          </button>
        </div>
      )}
      {((handoverEnabled && request.stage) || request.legacyReview) && <HandoverPanel request={request} party="OWNER" />}
      {dialog}
    </li>
  );
}
