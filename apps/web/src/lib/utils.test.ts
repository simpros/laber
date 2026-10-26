import { describe, it, expect } from "bun:test";
import {
  statusColor,
  containerStatusBg,
  statusTone,
  timeAgo,
} from "./utils";

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
    expect(containerStatusBg("dead")).toBe(
      "bg-danger/10 border-danger/20"
    );
  });
});

describe("statusTone", () => {
  it("maps stack and deployment-log statuses onto one tone scale", () => {
    expect(statusTone("success")).toBe("success");
    expect(statusTone("deployed")).toBe("success");
    expect(statusTone("running")).toBe("warning");
    expect(statusTone("stopped")).toBe("warning");
    expect(statusTone("error")).toBe("danger");
    expect(statusTone("discovered")).toBe("neutral");
  });

  it("falls back to neutral for unrecognized statuses", () => {
    expect(statusTone("bogus-status")).toBe("neutral");
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
