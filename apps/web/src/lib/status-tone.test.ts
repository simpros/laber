import { describe, it, expect } from "bun:test";
import { stackTone, logTone } from "./status-tone";

describe("stackTone", () => {
  it("maps stack statuses onto the kit tone scale", () => {
    expect(stackTone("deployed")).toBe("success");
    expect(stackTone("stopped")).toBe("warning");
    expect(stackTone("error")).toBe("danger");
    expect(stackTone("discovered")).toBe("neutral");
  });
});

describe("logTone", () => {
  it("maps deployment-log statuses onto the kit tone scale", () => {
    expect(logTone("running")).toBe("warning");
    expect(logTone("success")).toBe("success");
    expect(logTone("error")).toBe("danger");
  });
});
