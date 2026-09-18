import { describe, it, expect } from "bun:test";

const { render, screen, cleanup } = await import("@testing-library/react");
const { default: Card } = await import("./Card.js");

describe("Card", () => {
  it("renders children text", () => {
    try {
      render(<Card>Card content</Card>);
      expect(screen.getByText("Card content")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("applies default card styling", () => {
    try {
      const { container } = render(<Card>Styled</Card>);
      const el = container.firstElementChild as HTMLElement;
      expect(el.className).toContain("bg-surface-2");
      expect(el.className).toContain("border");
      expect(el.className).toContain("rounded-xl");
    } finally {
      cleanup();
    }
  });

  it("accepts custom class", () => {
    try {
      const { container } = render(<Card className="mt-4">Custom</Card>);
      const el = container.firstElementChild as HTMLElement;
      expect(el.className).toContain("mt-4");
    } finally {
      cleanup();
    }
  });
});
