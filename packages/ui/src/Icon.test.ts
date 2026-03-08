import { describe, it, expect } from "bun:test";
import { render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Icon from "./Icon.svelte";

const pathSnippet = () =>
  createRawSnippet(() => ({
    render: () => `<path d="M0 0L16 16" />`,
  }));

describe("Icon", () => {
  it("renders an SVG element", () => {
    const { container } = render(Icon, { children: pathSnippet() });
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("applies default size class (md -> w-4 h-4)", () => {
    const { container } = render(Icon, { children: pathSnippet() });
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("class")).toContain("h-4");
    expect(svg.getAttribute("class")).toContain("w-4");
  });
});
