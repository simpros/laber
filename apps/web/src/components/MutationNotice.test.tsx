import { describe, it, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import MutationNotice, { noticeFor } from "./MutationNotice";

type NoticeMutation = ComponentProps<typeof MutationNotice>["mutation"];

function stub(overrides: Partial<NoticeMutation> = {}): NoticeMutation {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    ...overrides,
  };
}

describe("noticeFor", () => {
  it("hides a stale error while its retry is in flight", () => {
    expect(
      noticeFor(
        stub({
          isPending: true,
          isError: true,
          error: new Error("boom"),
        })
      )
    ).toEqual({ kind: "hidden" });
  });

  it("hides settled output while a new retry is in flight", () => {
    expect(noticeFor(stub({ isPending: true, data: "saved" }))).toEqual({
      kind: "hidden",
    });
  });

  it("shows the error once the retry settles", () => {
    const error = new Error("boom");
    expect(noticeFor(stub({ isError: true, error }))).toEqual({
      kind: "error",
      error,
    });
  });
});

describe("MutationNotice", () => {
  it("hides a stale error while its retry is in flight", () => {
    const html = renderToStaticMarkup(
      <MutationNotice
        mutation={stub({
          isPending: true,
          isError: true,
          error: new Error("boom"),
        })}
        errorFallback="Save failed"
      />
    );
    expect(html).toBe("");
  });

  it("shows the error once the retry settles", () => {
    const html = renderToStaticMarkup(
      <MutationNotice
        mutation={stub({ isError: true, error: new Error("boom") })}
        errorFallback="Save failed"
      />
    );
    expect(html).toContain("boom");
  });
});
