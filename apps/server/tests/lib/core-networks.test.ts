import "../setup";
import { describe, it, expect } from "bun:test";
import {
  assertExtraNetworks,
  formatExtraNetworks,
  parseExtraNetworks,
} from "../../src/lib/core-networks";
import { ValidationError } from "../../src/lib/errors";

describe("parseExtraNetworks", () => {
  it("parses a comma-separated row", () => {
    expect(parseExtraNetworks("auth, monitor")).toEqual([
      "auth",
      "monitor",
    ]);
  });

  it("trims names and keeps their order", () => {
    expect(parseExtraNetworks(" auth ,monitor ")).toEqual([
      "auth",
      "monitor",
    ]);
  });

  it("drops blanks, duplicates and main", () => {
    expect(parseExtraNetworks(" , auth, auth, main, monitor ")).toEqual([
      "auth",
      "monitor",
    ]);
  });

  it("treats missing and empty rows as no extras", () => {
    expect(parseExtraNetworks(undefined)).toEqual([]);
    expect(parseExtraNetworks("")).toEqual([]);
    expect(parseExtraNetworks(" , ")).toEqual([]);
  });
});

describe("assertExtraNetworks", () => {
  it("accepts names Docker can declare verbatim", () => {
    expect(() => assertExtraNetworks("auth, monitor_2")).not.toThrow();
    expect(() => assertExtraNetworks("main")).not.toThrow();
    expect(() => assertExtraNetworks("")).not.toThrow();
  });

  it("rejects names Docker cannot use verbatim", () => {
    for (const bad of ["auth net", "auth/blue", "-auth", "auth;rm"]) {
      expect(() => assertExtraNetworks(bad)).toThrow(ValidationError);
    }
  });

  it("rejects names Docker reserves for its own networks", () => {
    for (const bad of ["bridge", "default", "host", "none"]) {
      expect(() => assertExtraNetworks(bad)).toThrow(ValidationError);
    }
  });

  it("rejects one-character names", () => {
    expect(() => assertExtraNetworks("a")).toThrow(ValidationError);
  });
});

describe("formatExtraNetworks", () => {
  it("round-trips through parse", () => {
    const networks = ["auth", "monitor"];
    expect(parseExtraNetworks(formatExtraNetworks(networks))).toEqual(
      networks
    );
  });
});
