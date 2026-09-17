import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/svelte";
import StatusBadge from "./StatusBadge.svelte";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(StatusBadge, { status: "success" });
    expect(screen.getByText("success")).toBeTruthy();
  });

  it("applies success status classes", () => {
    const { container } = render(StatusBadge, { status: "success" });
    const el = container.querySelector("span") as HTMLElement;
    expect(el.className).toContain("text-success");
    expect(el.className).toContain("bg-success");
  });

  it("applies error status classes", () => {
    const { container } = render(StatusBadge, { status: "error" });
    const el = container.querySelector("span") as HTMLElement;
    expect(el.className).toContain("text-danger");
    expect(el.className).toContain("bg-danger");
  });

  it("applies warning status classes for unknown statuses", () => {
    const { container } = render(StatusBadge, { status: "running" });
    const el = container.querySelector("span") as HTMLElement;
    expect(el.className).toContain("text-warning");
    expect(el.className).toContain("bg-warning");
  });

  it("accepts custom class", () => {
    const { container } = render(StatusBadge, {
      status: "success",
      class: "ml-2",
    });
    const el = container.querySelector("span") as HTMLElement;
    expect(el.className).toContain("ml-2");
  });

  it("renders as a span element", () => {
    const { container } = render(StatusBadge, { status: "success" });
    const el = container.querySelector("span");
    expect(el).toBeTruthy();
  });
});
