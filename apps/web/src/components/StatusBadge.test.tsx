import { it, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import StatusBadge from "./StatusBadge";

const CASES = [
  ["deployed", "text-success"],
  ["success", "text-success"],
  ["stopped", "text-warning"],
  ["running", "text-warning"],
  ["error", "text-danger"],
  ["discovered", "text-text-secondary"],
] as const;

for (const [status, tone] of CASES) {
  it(`${status} → ${tone}`, () => {
    expect(
      renderToStaticMarkup(<StatusBadge status={status} />)
    ).toContain(tone);
  });
}
