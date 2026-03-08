import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/svelte";
import CardHeader from "./CardHeader.svelte";

describe("CardHeader", () => {
  it("renders the title text", () => {
    render(CardHeader, { title: "Settings" });
    expect(screen.getByText("Settings")).toBeTruthy();
  });
});
