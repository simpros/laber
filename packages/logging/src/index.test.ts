import { describe, it, expect } from "bun:test";
import { errorDetails, getLogger } from "./index";

describe("getLogger", () => {
  it("returns a logger object", () => {
    const logger = getLogger("test");
    expect(logger).toBeDefined();
  });

  it("returns a logger with standard log methods", () => {
    const logger = getLogger("test");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("creates loggers with different categories", () => {
    const logger1 = getLogger("web");
    const logger2 = getLogger("db");
    expect(logger1).toBeDefined();
    expect(logger2).toBeDefined();
  });

  it("prefixes every category with the package root", () => {
    expect(getLogger("server").category).toEqual(["laber", "server"]);
    expect(getLogger("server", "actions").category).toEqual([
      "laber",
      "server",
      "actions",
    ]);
  });
});

describe("errorDetails", () => {
  it("preserves the stack of Error values", () => {
    const error = new Error("boom");
    expect(errorDetails(error)).toBe(error.stack);
  });

  it("passes strings through unchanged", () => {
    expect(errorDetails("boom")).toBe("boom");
  });

  it("serializes non-Error values", () => {
    expect(errorDetails({ code: 1 })).toBe('{"code":1}');
  });
});
