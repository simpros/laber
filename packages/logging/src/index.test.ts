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

describe("formatter", () => {
  function capture(method: "info" | "warn", fn: () => void): string {
    const lines: string[] = [];
    const original = console[method];
    console[method] = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "));
    };
    try {
      fn();
    } finally {
      console[method] = original;
    }
    return lines.join("\n");
  }

  function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  it("renders an interpolated property exactly once", () => {
    const output = capture("warn", () => {
      getLogger("test").warn("hello {name}", { name: "world" });
    });
    expect(occurrences(output, "world")).toBe(1);
  });

  it("renders escaped braces literally without a property suffix", () => {
    const output = capture("info", () => {
      getLogger("test").info("literal {{q}}", { q: 1 });
    });
    expect(output).toContain("literal {q}");
    expect(output).not.toContain("q=");
  });

  it("renders nested paths once without duplicating the property", () => {
    const output = capture("info", () => {
      getLogger("test").info("nested {u.id}", { u: { id: 7 } });
    });
    expect(output).toContain("nested 7");
    expect(output).not.toContain("u=");
  });
});
