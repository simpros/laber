import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import AuthLayout from "./AuthLayout.svelte";

const textSnippet = (text: string) =>
  createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));

describe("AuthLayout", () => {
  it("renders the title", () => {
    render(AuthLayout, {
      title: "Welcome",
      subtitle: "Please sign in",
      children: textSnippet("form"),
    });
    expect(screen.getByText("Welcome")).toBeTruthy();
  });

  it("renders the subtitle", () => {
    render(AuthLayout, {
      title: "Welcome",
      subtitle: "Please sign in",
      children: textSnippet("form"),
    });
    expect(screen.getByText("Please sign in")).toBeTruthy();
  });

  it("renders children content", () => {
    render(AuthLayout, {
      title: "Welcome",
      subtitle: "Please sign in",
      children: textSnippet("Login form here"),
    });
    expect(screen.getByText("Login form here")).toBeTruthy();
  });
});
