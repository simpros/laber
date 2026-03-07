import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Card from "./Card.svelte";

const textSnippet = (text: string) =>
  createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));

describe("Card", () => {
  it("renders a container element", () => {
    const { container } = render(Card, { children: textSnippet("Content") });
    expect(container.firstElementChild).toBeTruthy();
  });

  it("renders children text", () => {
    render(Card, { children: textSnippet("Card content") });
    expect(screen.getByText("Card content")).toBeTruthy();
  });

  it("applies default card styling", () => {
    const { container } = render(Card, { children: textSnippet("Styled") });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("bg-surface-2");
    expect(el.className).toContain("border");
    expect(el.className).toContain("rounded-xl");
  });

  it("accepts custom class", () => {
    const { container } = render(Card, {
      class: "mt-4",
      children: textSnippet("Custom"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("mt-4");
  });
});
