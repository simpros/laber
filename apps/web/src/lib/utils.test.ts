import { describe, it, expect } from "bun:test";
import { statusColor, containerStatusBg, statusBadge, timeAgo } from "./utils";

describe("statusColor", () => {
  it("returns success class for running state", () => {
    expect(statusColor("running")).toBe("text-success");
  });

  it("returns warning class for exited state", () => {
    expect(statusColor("exited")).toBe("text-warning");
  });

  it("returns warning class for stopped state", () => {
    expect(statusColor("stopped")).toBe("text-warning");
  });

  it("returns danger class for unknown state", () => {
    expect(statusColor("unknown")).toBe("text-danger");
  });

  it("returns danger class for any unrecognized state", () => {
    expect(statusColor("something-else")).toBe("text-danger");
  });
});

describe("containerStatusBg", () => {
  it("returns success bg for running state", () => {
    expect(containerStatusBg("running")).toBe(
      "bg-success/10 border-success/20"
    );
  });

  it("returns warning bg for exited state", () => {
    expect(containerStatusBg("exited")).toBe(
      "bg-warning/10 border-warning/20"
    );
  });

  it("returns danger bg for unknown state", () => {
    expect(containerStatusBg("unknown")).toBe(
      "bg-danger/10 border-danger/20"
    );
  });

  it("returns danger bg for any unrecognized state", () => {
    expect(containerStatusBg("dead")).toBe("bg-danger/10 border-danger/20");
  });
});

describe("statusBadge", () => {
  it("returns success badge for deployed status", () => {
    expect(statusBadge("deployed")).toBe("bg-success/10 text-success");
  });

  it("returns warning badge for stopped status", () => {
    expect(statusBadge("stopped")).toBe("bg-warning/10 text-warning");
  });

  it("returns danger badge for error status", () => {
    expect(statusBadge("error")).toBe("bg-danger/10 text-danger");
  });

  it("returns discovered badge for discovered status", () => {
    expect(statusBadge("discovered")).toBe("bg-surface-3 text-text-secondary");
  });

  it("falls back to discovered for unknown status", () => {
    expect(statusBadge("unknown")).toBe("bg-surface-3 text-text-secondary");
  });
});

describe("timeAgo", () => {
  it('returns "never" for null input', () => {
    expect(timeAgo(null)).toBe("never");
  });

  it('returns "just now" for recent dates', () => {
    const now = new Date();
    expect(timeAgo(now)).toBe("just now");
  });

  it("returns minutes ago for dates within an hour", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(fiveMinutesAgo)).toBe("5m ago");
  });

  it("returns hours ago for dates within a day", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(timeAgo(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago for dates older than a day", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });

  it("returns 1m ago for 90 seconds", () => {
    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
    expect(timeAgo(ninetySecondsAgo)).toBe("1m ago");
  });

  it("handles string dates", () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });
});
