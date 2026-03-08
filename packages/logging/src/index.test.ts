import { describe, it, expect } from "bun:test";
import { getLogger } from "./index";

describe("getLogger", () => {
  it("returns a logger object", () => {
    const logger = getLogger(["laber", "test"]);
    expect(logger).toBeDefined();
  });

  it("returns a logger with standard log methods", () => {
    const logger = getLogger(["laber", "test"]);
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("creates loggers with different categories", () => {
    const logger1 = getLogger(["laber", "web"]);
    const logger2 = getLogger(["laber", "db"]);
    expect(logger1).toBeDefined();
    expect(logger2).toBeDefined();
  });
});
