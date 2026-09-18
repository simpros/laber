import { describe, it, expect } from "bun:test";
import {
  latestSettled,
  type MutationNoticeSource,
  type NoticeMutation,
} from "./MutationNotice";

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

function source(
  mutation: NoticeMutation,
  errorFallback: string,
): MutationNoticeSource {
  return { mutation, errorFallback };
}

describe("latestSettled", () => {
  it("a newer silent (null) success clears an older sibling error", () => {
    const failedAdd = source(
      stub({ isError: true, error: new Error("boom"), errorUpdatedAt: 100 }),
      "Failed to add repository",
    );
    const silentRemove = source(
      stub({ isSuccess: true, data: null, dataUpdatedAt: 200 }),
      "Failed to remove repository",
    );
    // The picked source carries no banner copy (`data: null` renders
    // nothing), so the stale Add failure is cleared, not resurrected.
    expect(latestSettled([failedAdd, silentRemove])).toBe(silentRemove);
  });

  it("a newer error still wins over an older success", () => {
    const syncOk = source(
      stub({ isSuccess: true, data: "Synced.", dataUpdatedAt: 100 }),
      "Failed to sync repository",
    );
    const failedRemove = source(
      stub({ isError: true, error: new Error("boom"), errorUpdatedAt: 200 }),
      "Failed to remove repository",
    );
    expect(latestSettled([syncOk, failedRemove])).toBe(failedRemove);
  });

  it("ignores unsettled sources", () => {
    expect(latestSettled([source(stub(), "never")])).toBeUndefined();
  });
});
