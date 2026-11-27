// Real Admin Mode: แปลงข้อมูลจาก Backend + สถานะการยืนยันสิทธิ์ (mock เฉพาะ request() ของ api/client)
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, request: (...args: unknown[]) => request(...args) };
});

const { ApiError } = await import("../api/client");
const { caseNumber, fromAnnouncement, toAnnouncement, toCase, toPet } = await import("./api");
const { loadAdmin, mutateAdmin, realCaseAction } = await import("./real");
const { usePreview } = await import("./store");

const me = { id: "u-admin", name: "ผู้ดูแลจริง", email: "admin@example.test", role: "ADMIN", permissions: [], workflow: { handoverEnabled: false, reminderHours: 24, adminHours: 48, escalationHours: 72 } };
const pet = {
  id: 7, name: "ข้าวตัง", species: "DOG", breed: "", sex: "MALE", ageMonths: 6, province: "ภูเก็ต", description: "ใจดี", imageUrl: "",
  vaccinated: true, sterilized: false, urgent: false, status: "PENDING", visibility: "CHANGES_REQUESTED", moderationReason: "รูปไม่ชัด",
  moderatedAt: null, ownerId: "u-owner", ownerName: "เจ้าของ", createdAt: "2026-11-20T03:00:00.000Z",
};
const apiCase = {
  id: 12, petId: 7, applicantId: "u-app", applicantName: "ผู้ขอ", ownerId: "u-owner", ownerName: "เจ้าของ", phone: "0811111111",
  housing: "CONDO", message: "สนใจรับเลี้ยง", stage: "ACCEPTED", createdAt: "2026-11-20T03:00:00.000Z", lastActivityAt: "2026-11-21T03:00:00.000Z",
  followUpRequired: false, disputed: false, legacyReview: true, closedAt: null, completedAt: null, verifiedAt: null, resolution: "",
  reports: { owner: { party: "OWNER", handoverDate: "2026-11-21", outcome: "HANDED_OVER", note: "", evidenceUrl: "https://x.test/a.jpg" }, applicant: null },
  confirmations: { owner: false, applicant: false },
};
const users = [{ id: "u-owner", name: "เจ้าของ", role: "USER", joinedAt: "2026-01-01T00:00:00.000Z" }];
const announcement = { id: 3, title: "ตลาดนัด", category: "กิจกรรม", description: "", eventDate: null, eventTime: "", location: "", contact: "", cta: "ดู", destination: "/pets", imageUrl: "", status: "PUBLISHED", displayOrder: 1, isDemo: false };

function backend(overrides: Record<string, () => unknown> = {}) {
  request.mockImplementation(async (path: string) => {
    for (const [prefix, fn] of Object.entries(overrides)) if (path.startsWith(prefix)) return fn();
    if (path === "/admin/me") return me;
    if (path.startsWith("/admin/pets")) return { items: [pet], total: 1, page: 1, limit: 200 };
    if (path.startsWith("/admin/adoptions") && path.includes("/timeline")) return [{ at: "2026-11-21T03:00:00.000Z", kind: "STAGE", actorRole: "OWNER", actorName: "เจ้าของ", label: "เจ้าของอนุมัติ", note: "" }];
    if (path.startsWith("/admin/adoptions")) return { items: [apiCase], total: 1, page: 1, limit: 200 };
    if (path.startsWith("/admin/users")) return { items: users, total: 1, page: 1, limit: 200 };
    if (path === "/admin/announcements") return [announcement];
    return {};
  });
}

beforeEach(() => {
  request.mockReset();
  usePreview.setState({ status: "checking", pets: [], cases: [], users: [], announcements: [] });
});

describe("mapping Backend → screen model", () => {
  it("pets: visibility + moderation reason", () => {
    expect(toPet(pet as never)).toMatchObject({ id: 7, visibility: "changes", reviewNote: "รูปไม่ชัด", createdAt: Date.parse(pet.createdAt) });
  });

  it("cases: AD-<id>, legacy review counts as follow-up, real evidence url", () => {
    const item = toCase(apiCase as never);
    expect(item).toMatchObject({ id: "AD-12", stage: "ACCEPTED", flagged: true, legacy: true, contact: "0811111111", housing: "คอนโด" });
    expect(item.reports.owner).toMatchObject({ date: "2026-11-21", status: "delivered", evidenceUrl: "https://x.test/a.jpg" });
    expect(caseNumber("AD-12")).toBe(12);
    expect(() => caseNumber("12")).toThrow();
  });

  it("announcements round-trip without changing fields", () => {
    const screen = toAnnouncement(announcement as never);
    expect(screen).toMatchObject({ id: "3", published: true, order: 1, date: "" });
    expect(fromAnnouncement(screen)).toMatchObject({ status: "PUBLISHED", displayOrder: 1, eventDate: null, destination: "/pets" });
  });

});

describe("loadAdmin: role is verified by the Backend before any data", () => {
  it("success → ready with real data only (no mock fallback)", async () => {
    backend();
    await loadAdmin();
    const state = usePreview.getState();
    expect(state.status).toBe("ready");
    expect(request.mock.calls[0][0]).toBe("/admin/me");
    expect(state.pets.map((p) => p.id)).toEqual([7]);
    expect(state.cases.map((c) => c.id)).toEqual(["AD-12"]);
    expect(state.preferences.name).toBe("ผู้ดูแลจริง");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [500, "error"],
  ] as const)("/admin/me → %i = %s, and no data is loaded", async (status, expected) => {
    backend({ "/admin/me": () => { throw new ApiError(status, "ปฏิเสธ"); } });
    await loadAdmin();
    const state = usePreview.getState();
    expect(state.status).toBe(expected);
    expect(state.pets).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1); // ไม่โหลดข้อมูลอื่นก่อนยืนยันสิทธิ์
  });

  it("network failure → error state (retryable)", async () => {
    backend({ "/admin/me": () => { throw new TypeError("Failed to fetch"); } });
    await loadAdmin();
    expect(usePreview.getState()).toMatchObject({ status: "error", error: "Failed to fetch" });
  });

  it("role revoked mid-session → silent refresh clears data", async () => {
    backend();
    await loadAdmin();
    backend({ "/admin/me": () => { throw new ApiError(403, "บัญชีนี้ไม่มีสิทธิ์"); } });
    await loadAdmin({ silent: true });
    expect(usePreview.getState()).toMatchObject({ status: "forbidden", pets: [] });
  });
});

describe("mutations go to the Backend, then reload", () => {
  it("case actions map to admin endpoints", async () => {
    backend();
    await loadAdmin();
    request.mockClear();
    expect(await realCaseAction("AD-12", { type: "legacyReopen", note: "ยังไม่ได้ส่งมอบจริง" }, "ok")).toBe(true);
    const [path, init] = request.mock.calls[0];
    expect(path).toBe("/admin/adoptions/12/review-handover");
    expect(JSON.parse(init.body)).toEqual({ decision: "REOPEN", note: "ยังไม่ได้ส่งมอบจริง" });
    expect(request.mock.calls.some(([p]) => p === "/admin/me")).toBe(true); // โหลดใหม่หลังเปลี่ยนข้อมูล
    expect(request.mock.calls.at(-1)?.[0]).toBe("/admin/adoptions/12/timeline");
  });

  it("owner/applicant-only actions are refused without calling the API", async () => {
    backend();
    await loadAdmin();
    request.mockClear();
    expect(await realCaseAction("AD-12", { type: "accept" }, "ok")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("API error → false, data kept", async () => {
    backend();
    await loadAdmin();
    expect(await mutateAdmin(() => Promise.reject(new ApiError(409, "เคสนี้ปิดแล้ว")), "ok")).toBe(false);
    expect(usePreview.getState().cases).toHaveLength(1);
  });
});
