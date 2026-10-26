import { describe, it, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MutationNotice } from "./MutationNotice";

type NoticeMutation = {
  data: string | null | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
};

function stub(overrides: Partial<NoticeMutation> = {}): NoticeMutation {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: false,
    ...overrides,
  };
}

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
