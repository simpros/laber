import { describe, it, expect } from "bun:test";

const { render, screen, cleanup } = await import("@testing-library/react");
const { default: Alert } = await import("./Alert.js");

describe("Alert", () => {
  it("renders children text", () => {
    try {
      render(<Alert variant="success">All good</Alert>);
      expect(screen.getByText("All good")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("applies success variant classes", () => {
    try {
      const { container } = render(
        <Alert variant="success">Success</Alert>
      );
      const el = container.firstElementChild as HTMLElement;
      expect(el.className).toContain("text-success");
      expect(el.className).toContain("border-success");
    } finally {
      cleanup();
    }
  });

  it("applies error variant classes", () => {
    try {
      const { container } = render(<Alert variant="error">Error</Alert>);
      const el = container.firstElementChild as HTMLElement;
      expect(el.className).toContain("text-danger");
      expect(el.className).toContain("border-danger");
    } finally {
      cleanup();
    }
  });

  it("applies warning variant classes", () => {
    try {
      const { container } = render(<Alert variant="warning">Warn</Alert>);
      const el = container.firstElementChild as HTMLElement;
      expect(el.className).toContain("text-warning");
      expect(el.className).toContain("border-warning");
    } finally {
      cleanup();
    }
  });

  it("applies mono styling when mono prop is true", () => {
    try {
      const { container } = render(
        <Alert variant="success" mono>
          Mono
        </Alert>
      );
      const el = container.firstElementChild as HTMLElement;
      expect(el.className).toContain("font-mono");
      expect(el.className).toContain("whitespace-pre-wrap");
    } finally {
      cleanup();
    }
  });
});
