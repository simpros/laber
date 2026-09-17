import { describe, it, expect } from "bun:test";

const { render, screen, cleanup } = await import("@testing-library/react");
const { default: StatusBadge } = await import("./StatusBadge.js");
const { default: Icon } = await import("./Icon.js");
const { default: AuthLayout } = await import("./AuthLayout.js");
const { default: CardHeader } = await import("./CardHeader.js");

describe("StatusBadge", () => {
  it("renders status text with success styling", () => {
    try {
      render(<StatusBadge status="success" />);
      const el = screen.getByText("success");
      expect(el.className).toContain("text-success");
    } finally {
      cleanup();
    }
  });

  it("renders error styling", () => {
    try {
      render(<StatusBadge status="error" />);
      expect(screen.getByText("error").className).toContain("text-danger");
    } finally {
      cleanup();
    }
  });
});

describe("Icon", () => {
  it("renders an svg", () => {
    try {
      const { container } = render(
        <Icon>
          <path d="M4 4l8 8" />
        </Icon>
      );
      expect(container.querySelector("svg")).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});

describe("AuthLayout", () => {
  it("renders title and subtitle", () => {
    try {
      render(
        <AuthLayout title="laber" subtitle="Hi">
          <span>child</span>
        </AuthLayout>
      );
      expect(screen.getByText("laber")).toBeTruthy();
      expect(screen.getByText("Hi")).toBeTruthy();
      expect(screen.getByText("child")).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});

describe("CardHeader", () => {
  it("renders title and actions", () => {
    try {
      render(
        <CardHeader title="Core Services" actions={<button>Go</button>} />
      );
      expect(screen.getByText("Core Services")).toBeTruthy();
      expect(screen.getByText("Go")).toBeTruthy();
    } finally {
      cleanup();
    }
  });
});
