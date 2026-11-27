import { describe, expect, it } from "vitest";
import { insight, matches } from "./ui";
import { createCase, currentStep, followUp, HOUR, transition, type CaseAction, type Handover } from "./workflow";

const start = Date.UTC(2026, 10, 23);
const delivered: Handover = { date: "2026-11-23", status: "delivered", note: "", evidence: false };
const pending = () => createCase("AD-T", 1, "U4", start);
const run = (actions: CaseAction[], item = pending()) => actions.reduce((current, action, index) => transition(current, action, start + (index + 1) * HOUR), item);
const reported: CaseAction[] = [{ type: "accept" }, { type: "arrange" },
  { type: "report", party: "owner", report: delivered }, { type: "report", party: "applicant", report: delivered }];
const confirmed: CaseAction[] = [...reported, { type: "confirm", party: "owner" }, { type: "confirm", party: "applicant" }];

describe("stage transitions", () => {
  it("owner acceptance is not a completed adoption", () => {
    expect(run([{ type: "accept" }]).stage).toBe("ACCEPTED");
    expect(run([{ type: "accept" }, { type: "arrange" }]).stage).toBe("ARRANGING_HANDOVER");
  });

  it("rejects actions that do not fit the current stage", () => {
    const item = pending();
    expect(transition(item, { type: "arrange" }, start)).toBe(item);
    expect(transition(item, { type: "confirm", party: "owner" }, start)).toBe(item);
    expect(transition(run([{ type: "accept" }]), { type: "reject" }, start)).toMatchObject({ stage: "ACCEPTED" });
  });

  it("a one-sided handover report never completes the case", () => {
    const item = run([{ type: "accept" }, { type: "arrange" }, { type: "report", party: "owner", report: delivered }]);
    expect(item.stage).toBe("HANDOVER_REPORTED");
    expect(transition(item, { type: "confirm", party: "owner" }, start)).toBe(item); // reports do not match yet
  });

  it("completes only when both parties confirm matching reports", () => {
    expect(run([...reported, { type: "confirm", party: "owner" }]).stage).toBe("HANDOVER_REPORTED");
    const done = run(confirmed);
    expect(done.stage).toBe("COMPLETED");
    expect(done.completedAt).toBeDefined();
  });

  it("a new report clears earlier confirmations", () => {
    const item = run([...reported, { type: "confirm", party: "owner" }, { type: "report", party: "owner", report: { ...delivered, note: "แก้ไข" } }]);
    expect(item.confirmations).toEqual({});
  });

  it("mismatched reports mark the case disputed and require admin verification", () => {
    const disputed = run([{ type: "accept" }, { type: "arrange" }, { type: "report", party: "owner", report: delivered },
      { type: "report", party: "applicant", report: { ...delivered, date: "2026-11-24" } }]);
    expect(disputed.disputed).toBe(true);
    expect(disputed.timeline.some((event) => event.label.includes("ไม่ตรงกัน"))).toBe(true);
    const fixed = run([{ type: "report", party: "applicant", report: delivered }, { type: "confirm", party: "owner" }, { type: "confirm", party: "applicant" }], disputed);
    expect(fixed.stage).toBe("HANDOVER_REPORTED"); // still disputed → not completed by confirmations alone
    expect(transition(fixed, { type: "verify", note: "  " }, start)).toBe(fixed); // empty note refused
    const verified = transition(fixed, { type: "verify", note: "ตรวจแล้ว" }, start);
    expect(verified).toMatchObject({ stage: "COMPLETED", verified: true, disputed: false, resolution: "ตรวจแล้ว" });
  });

  it("closed cases ignore every action and only terminal cases can close", () => {
    expect(transition(pending(), { type: "close" }, start).closed).toBe(false);
    const closed = run([...confirmed, { type: "close" }]);
    expect(closed.closed).toBe(true);
    expect(transition(closed, { type: "flag" }, start)).toBe(closed);
  });
});

describe("follow-up policy", () => {
  it.each([[0, "normal"], [23, "normal"], [24, "reminder"], [47, "reminder"], [48, "high"], [71, "high"], [72, "urgent"]] as const)(
    "PENDING idle %i h → %s", (hours, priority) => {
      expect(followUp(pending(), start + hours * HOUR).priority).toBe(priority);
    });

  it("admin notes and flags do not reset the owner's idle clock", () => {
    const item = run([{ type: "note", note: "โทรแล้ว" }, { type: "note", note: "รอ" }, { type: "flag" }, { type: "unflag" }]);
    expect(item.activityAt).toBe(start);
    expect(followUp(item, start + 50 * HOUR)).toMatchObject({ hours: 50, overdue: true, priority: "high" });
  });

  it("follow-up is a flag separate from the stage, and never changes the stage", () => {
    const flagged = run([{ type: "accept" }, { type: "flag" }]);
    expect(flagged.stage).toBe("ACCEPTED");
    expect(followUp(flagged, start + 2 * HOUR)).toMatchObject({ required: true, priority: "high" });
    expect(followUp(pending(), start + 500 * HOUR).priority).toBe("urgent"); // time alone never approves, rejects or completes
    expect(transition(pending(), { type: "flag" }, start + 500 * HOUR).stage).toBe("PENDING");
  });

  it("only PENDING time counts as owner idle; terminal cases have no priority", () => {
    expect(followUp(run([{ type: "accept" }]), start + 100 * HOUR).priority).toBe("normal");
    expect(followUp(run(confirmed), start + 500 * HOUR).priority).toBe("normal");
  });

  it("insight text follows the policy thresholds", () => {
    expect(insight(pending(), start + 73 * HOUR).reason).toContain("72");
    expect(insight(pending(), start + 50 * HOUR).reason).toContain("48");
    expect(insight(pending(), start + 25 * HOUR).reason).toContain("24");
  });
});

describe("step indicator (regression)", () => {
  it("maps stages to the five sections", () => {
    const steps = [pending(), run([{ type: "accept" }]), run([{ type: "accept" }, { type: "arrange" }]), run(reported),
      run([...reported, { type: "markDisputed" }]), run(confirmed), run([...confirmed, { type: "close" }])].map(currentStep);
    expect(steps).toEqual([0, 1, 2, 2, 3, 3, 4]);
    expect(currentStep(run([{ type: "reject" }]))).toBe(1);
    expect(currentStep(run([{ type: "cancel" }]))).toBe(0);
  });
});

describe("search helper", () => {
  it("matches case-insensitively across fields and treats blank as match-all", () => {
    expect(matches("ข้าว", "ข้าวปั้น")).toBe(true);
    expect(matches("ad-104", "AD-104")).toBe(true);
    expect(matches("ไม่มี", "ข้าวปั้น", undefined)).toBe(false);
    expect(matches("  ", "x")).toBe(true);
  });
});
