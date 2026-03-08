import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Button from "./Button.svelte";

const textSnippet = (text: string) =>
  createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));

describe("Button", () => {
  it("renders a button element", () => {
    render(Button, { children: textSnippet("Click") });
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("renders with children text", () => {
    render(Button, { children: textSnippet("Click me") });
    expect(screen.getByText("Click me")).toBeTruthy();
  });

  it("has no type attribute by default", () => {
    render(Button, { children: textSnippet("Btn") });
    expect(screen.getByRole("button").getAttribute("type")).toBeNull();
  });

  it("accepts type=submit", () => {
    render(Button, { type: "submit", children: textSnippet("Submit") });
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("accepts type=button", () => {
    render(Button, { type: "button", children: textSnippet("Btn") });
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("can be disabled", () => {
    render(Button, { disabled: true, children: textSnippet("Disabled") });
    const btn = screen.getByRole("button");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("applies secondary variant by default", () => {
    render(Button, { children: textSnippet("Default") });
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border");
  });

  it("applies primary variant classes", () => {
    render(Button, { variant: "primary", children: textSnippet("Primary") });
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-accent");
  });

  it("applies danger variant classes", () => {
    render(Button, { variant: "danger", children: textSnippet("Danger") });
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-danger");
  });

  it("applies ghost variant classes", () => {
    render(Button, { variant: "ghost", children: textSnippet("Ghost") });
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-text-secondary");
  });

  it("applies sm size classes", () => {
    render(Button, { size: "sm", children: textSnippet("Small") });
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-3");
    expect(btn.className).toContain("text-xs");
  });

  it("applies md size classes by default", () => {
    render(Button, { children: textSnippet("Medium") });
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("px-4");
    expect(btn.className).toContain("text-sm");
  });

  it("passes extra attributes to the button", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(Button, { "aria-label": "Test", children: textSnippet("Btn") } as any);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Test");
  });
});
