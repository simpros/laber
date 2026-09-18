import { describe, it, expect } from "bun:test";
import { shouldHideNotice, type NoticeMutation } from "./MutationNotice";

function stub(overrides: Partial<NoticeMutation> = {}): NoticeMutation {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    ...overrides,
  };
}

describe("shouldHideNotice", () => {
  it("hides a stale error while its retry is pending", () => {
    expect(
      shouldHideNotice(
        stub({ isPending: true, isError: true, error: new Error("boom") }),
      ),
    ).toBe(true);
  });

  it("shows settled terminal states once pending clears", () => {
    expect(
      shouldHideNotice(
        stub({ isPending: false, isError: true, error: new Error("boom") }),
      ),
    ).toBe(false);
    expect(
      shouldHideNotice(
        stub({ isPending: false, isSuccess: true, data: "Saved." }),
      ),
    ).toBe(false);
  });
});
