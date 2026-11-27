import { afterEach, describe, expect, it, vi } from "vitest";
import { reportsMatch } from "../components/HandoverPanel";
import { adoptionLabel, canCancel } from "./adoption";

describe("adoptionLabel", () => {
  it("uses the detailed stage when the Backend sends it", () => {
    expect(adoptionLabel({ status: "APPROVED", stage: "ACCEPTED" })).toBe("ผู้โพสต์ตอบรับแล้ว");
    expect(adoptionLabel({ status: "APPROVED", stage: "HANDOVER_REPORTED" })).toBe("แจ้งส่งมอบแล้ว รอยืนยัน");
    expect(adoptionLabel({ status: "APPROVED", stage: "COMPLETED" })).toBe("รับเลี้ยงสำเร็จ");
  });
  it("falls back to status for the old Backend / mock mode, and keeps 'approved' for legacy review", () => {
    expect(adoptionLabel({ status: "APPROVED" })).toBe("อนุมัติแล้ว");
    expect(adoptionLabel({ status: "APPROVED", stage: "ACCEPTED", legacyReview: true })).toBe("อนุมัติแล้ว");
  });
});

describe("canCancel", () => {
  it.each([
    [{ status: "PENDING" as const }, false, true],
    [{ status: "PENDING" as const, stage: "PENDING" as const }, false, true],
    [{ status: "APPROVED" as const, stage: "ACCEPTED" as const }, false, false], // ขั้นตอนเดิม: ตอบรับแล้วยกเลิกไม่ได้
    [{ status: "APPROVED" as const, stage: "ACCEPTED" as const }, true, true],
    [{ status: "APPROVED" as const, stage: "ARRANGING_HANDOVER" as const }, true, true],
    [{ status: "APPROVED" as const, stage: "HANDOVER_REPORTED" as const }, true, false],
    [{ status: "APPROVED" as const, stage: "ACCEPTED" as const, legacyReview: true }, true, false],
    [{ status: "REJECTED" as const, stage: "REJECTED" as const }, true, false],
  ])("%j (handover %s) → %s", (request, handover, expected) => {
    expect(canCancel(request, handover)).toBe(expected);
  });
});

describe("reportsMatch", () => {
  const r = (handoverDate: string, outcome: "HANDED_OVER" | "NOT_HANDED_OVER" = "HANDED_OVER") => ({ handoverDate, outcome, note: "", evidenceUrl: "", createdAt: "" });
  it("needs both reports handed over on the same date", () => {
    expect(reportsMatch(r("2026-11-20"), r("2026-11-20"))).toBe(true);
    expect(reportsMatch(r("2026-11-20"), r("2026-11-21"))).toBe(false);
    expect(reportsMatch(r("2026-11-20"), r("2026-11-20", "NOT_HANDED_OVER"))).toBe(false);
    expect(reportsMatch(r("2026-11-20"), null)).toBe(false);
  });
});

describe("site API against an older Backend", () => {
  afterEach(() => vi.resetModules());

  it("404 from /config, /announcements, /me/notifications → feature off, no error", async () => {
    vi.doMock("../api/client", async () => {
      const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
      return { ...actual, request: () => Promise.reject(new actual.ApiError(404, "ไม่พบ API นี้")) };
    });
    const site = await import("../api/site");
    expect(await site.getSiteConfig()).toEqual({ adoptionHandoverWorkflow: false });
    expect(await site.getPublicAnnouncements()).toEqual([]);
    expect(await site.getNotifications()).toEqual({ unread: 0, items: [] });
  });

  it("other errors still surface (so the UI can show retry)", async () => {
    vi.doMock("../api/client", async () => {
      const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
      return { ...actual, request: () => Promise.reject(new actual.ApiError(500, "ล่ม")) };
    });
    const site = await import("../api/site");
    await expect(site.getNotifications()).rejects.toThrow("ล่ม");
  });
});
