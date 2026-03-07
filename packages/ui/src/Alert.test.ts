import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Alert from "./Alert.svelte";

const textSnippet = (text: string) =>
  createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));

describe("Alert", () => {
  it("renders children text", () => {
    render(Alert, { variant: "success", children: textSnippet("All good") });
    expect(screen.getByText("All good")).toBeTruthy();
  });

  it("applies success variant classes", () => {
    const { container } = render(Alert, {
      variant: "success",
      children: textSnippet("Success"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("text-success");
    expect(el.className).toContain("border-success");
  });

  it("applies error variant classes", () => {
    const { container } = render(Alert, {
      variant: "error",
      children: textSnippet("Error"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("text-danger");
    expect(el.className).toContain("border-danger");
  });

  it("applies warning variant classes", () => {
    const { container } = render(Alert, {
      variant: "warning",
      children: textSnippet("Warning"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("text-warning");
    expect(el.className).toContain("border-warning");
  });

  it("applies mono styling when mono prop is true", () => {
    const { container } = render(Alert, {
      variant: "success",
      mono: true,
      children: textSnippet("Mono"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("font-mono");
    expect(el.className).toContain("whitespace-pre-wrap");
  });

  it("does not apply mono styling by default", () => {
    const { container } = render(Alert, {
      variant: "success",
      children: textSnippet("Normal"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toContain("font-mono");
  });

  it("accepts custom class", () => {
    const { container } = render(Alert, {
      variant: "success",
      class: "my-custom",
      children: textSnippet("Custom"),
    });
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("my-custom");
  });
});
