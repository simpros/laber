import { describe, expect, test } from "bun:test";
import {
  checkBunVersions,
  readPin,
  type CheckedFile,
} from "./lib/bun-pin";

const PIN = "1.4.4";

function kindFor(path: string): CheckedFile["kind"] {
  if (path === "README.md") return "readme";
  if (path.endsWith("Dockerfile")) return "dockerfile";
  return "workflow";
}

function filesWith(overrides: Record<string, string> = {}): CheckedFile[] {
  const texts = {
    "README.md": "Requirements: Bun 1.4.4.\n",
    "apps/server/Dockerfile":
      "ARG BUN_VERSION\n\nFROM oven/bun:${BUN_VERSION}-alpine AS base\n",
    "apps/web/Dockerfile":
      "ARG BUN_VERSION\n\nFROM oven/bun:${BUN_VERSION}-alpine AS base\n",
    ".github/workflows/ci.yml": "uses: oven-sh/setup-bun@v2\n",
    ".github/actions/setup/action.yml": "bun-version-file: package.json\n",
    ...overrides,
  };
  return Object.entries(texts).map(([path, text]) => ({
    path,
    kind: kindFor(path),
    text,
  }));
}

describe("readPin", () => {
  test("reads the packageManager pin", () => {
    expect(readPin({ packageManager: "bun@1.4.4" })).toBe("1.4.4");
  });

  test("rejects a missing, loose, or suffixed pin", () => {
    expect(() => readPin({})).toThrow();
    expect(() => readPin({ packageManager: "bun@1.4" })).toThrow();
    expect(() =>
      readPin({ packageManager: "bun@1.4.4-staging" })
    ).toThrow();
  });
});

describe("checkBunVersions", () => {
  test("a differing major.minor in README fails", () => {
    const findings = checkBunVersions(
      filesWith({ "README.md": "Requirements: Bun 1.5.0.\n" }),
      PIN,
      PIN
    );
    expect(findings.map((finding) => finding.file)).toEqual(["README.md"]);
  });

  test("a patch-level skew in README fails", () => {
    const findings = checkBunVersions(
      filesWith({ "README.md": "Requirements: Bun 1.4.5.\n" }),
      PIN,
      PIN
    );
    expect(findings).toHaveLength(1);
  });

  test("a hardcoded Dockerfile base image fails", () => {
    const findings = checkBunVersions(
      filesWith({
        "apps/server/Dockerfile":
          "ARG BUN_VERSION\n\nFROM oven/bun:1.4.4-alpine AS base\n",
      }),
      PIN,
      PIN
    );
    expect(findings.map((finding) => finding.file)).toEqual([
      "apps/server/Dockerfile",
    ]);
  });

  test("a Dockerfile without the build arg fails", () => {
    const findings = checkBunVersions(
      filesWith({
        "apps/web/Dockerfile": "FROM oven/bun:alpine AS base\n",
      }),
      PIN,
      PIN
    );
    expect(findings.map((finding) => finding.file)).toEqual([
      "apps/web/Dockerfile",
    ]);
  });

  test("a hardcoded CI pin fails", () => {
    const findings = checkBunVersions(
      filesWith({
        ".github/workflows/ci.yml":
          'uses: oven-sh/setup-bun@v2\n  with:\n    bun-version: "1.4.4"\n',
      }),
      PIN,
      PIN
    );
    expect(findings.map((finding) => finding.file)).toEqual([
      ".github/workflows/ci.yml",
    ]);
  });

  test("a hardcoded pin in an unlisted workflow fails", () => {
    const findings = checkBunVersions(
      filesWith({
        ".github/workflows/new-ci.yml": 'bun-version: "1.2.3"\n',
      }),
      PIN,
      PIN
    );
    expect(findings.map((finding) => finding.file)).toEqual([
      ".github/workflows/new-ci.yml",
    ]);
  });

  test("a catalog entry that drifted from the pin fails", () => {
    const findings = checkBunVersions(filesWith(), PIN, "1.4.3");
    expect(findings.map((finding) => finding.file)).toEqual([
      "package.json",
    ]);
  });

  test("a missing catalog entry fails", () => {
    const findings = checkBunVersions(filesWith(), PIN, undefined);
    expect(findings.map((finding) => finding.file)).toEqual([
      "package.json",
    ]);
  });

  test("matching files pass", () => {
    expect(checkBunVersions(filesWith(), PIN, PIN)).toEqual([]);
  });
});
