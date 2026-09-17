import { describe, it, expect } from "bun:test";

const { render, screen, cleanup } = await import("@testing-library/react");
const { default: Button } = await import("./Button.js");

describe("Button", () => {
  it("renders a button element with children", () => {
    try {
      render(<Button>Click me</Button>);
      expect(screen.getByRole("button")).toBeTruthy();
      expect(screen.getByText("Click me")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("has no type attribute by default", () => {
    try {
      render(<Button>Btn</Button>);
      expect(screen.getByRole("button").getAttribute("type")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("accepts type=submit", () => {
    try {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole("button").getAttribute("type")).toBe(
        "submit"
      );
    } finally {
      cleanup();
    }
  });

  it("can be disabled", () => {
    try {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button").hasAttribute("disabled")).toBe(
        true
      );
    } finally {
      cleanup();
    }
  });

  it("applies secondary variant by default", () => {
    try {
      render(<Button>Default</Button>);
      expect(screen.getByRole("button").className).toContain("border");
    } finally {
      cleanup();
    }
  });

  it("applies primary variant classes", () => {
    try {
      render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole("button").className).toContain("bg-accent");
    } finally {
      cleanup();
    }
  });

  it("applies danger variant classes", () => {
    try {
      render(<Button variant="danger">Danger</Button>);
      expect(screen.getByRole("button").className).toContain(
        "text-danger"
      );
    } finally {
      cleanup();
    }
  });

  it("applies ghost variant classes", () => {
    try {
      render(<Button variant="ghost">Ghost</Button>);
      expect(screen.getByRole("button").className).toContain(
        "text-text-secondary"
      );
    } finally {
      cleanup();
    }
  });

  it("applies sm size classes", () => {
    try {
      render(<Button size="sm">Small</Button>);
      const cls = screen.getByRole("button").className;
      expect(cls).toContain("px-3");
      expect(cls).toContain("text-xs");
    } finally {
      cleanup();
    }
  });

  it("passes extra attributes to the button", () => {
    try {
      render(<Button aria-label="Test">Btn</Button>);
      expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
        "Test"
      );
    } finally {
      cleanup();
    }
  });
});
