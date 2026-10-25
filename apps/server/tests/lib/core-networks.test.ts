import "../setup";
import { describe, it, expect } from "bun:test";
import {
  formatExtraNetworks,
  normalizeExtraNetworks,
  parseExtraNetworks,
} from "../../src/lib/core-networks";
import { ValidationError } from "../../src/lib/errors";

describe("normalizeExtraNetworks", () => {
  it("trims names and keeps their order", () => {
    expect(normalizeExtraNetworks([" auth ", "monitor"])).toEqual([
      "auth",
      "monitor",
    ]);
  });

  it("drops blanks, duplicates and main", () => {
    expect(
      normalizeExtraNetworks(["", "auth", "auth", "main", " monitor "])
    ).toEqual(["auth", "monitor"]);
  });

  it("rejects names Docker cannot use verbatim", () => {
    for (const bad of ["auth net", "auth/blue", "-auth", "auth;rm"]) {
      expect(() => normalizeExtraNetworks([bad])).toThrow(ValidationError);
    }
  });
});

describe("parseExtraNetworks", () => {
  it("parses a comma-separated row", () => {
    expect(parseExtraNetworks("auth, monitor")).toEqual([
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

describe("formatExtraNetworks", () => {
  it("round-trips through parse", () => {
    const networks = ["auth", "monitor"];
    expect(parseExtraNetworks(formatExtraNetworks(networks))).toEqual(
      networks
    );
  });
});
