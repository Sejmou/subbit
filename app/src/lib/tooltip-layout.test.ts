import { describe, expect, it } from "vitest";
import { clampTooltipToViewport } from "../components/Tooltip";

describe("clampTooltipToViewport", () => {
  it("keeps element-anchored tooltips inside the left edge", () => {
    const { left } = clampTooltipToViewport(
      "element",
      20,
      100,
      120,
      24,
      800,
      600,
    );
    expect(left).toBe(8);
  });

  it("keeps element-anchored tooltips inside the right edge", () => {
    const { left } = clampTooltipToViewport(
      "element",
      780,
      100,
      120,
      24,
      800,
      600,
    );
    expect(left).toBe(672);
  });

  it("flips element-anchored tooltips above when below overflows", () => {
    const { top } = clampTooltipToViewport(
      "element",
      400,
      590,
      80,
      24,
      800,
      600,
    );
    expect(top).toBe(560);
  });

  it("keeps cursor-anchored tooltips inside the viewport", () => {
    const { left, top } = clampTooltipToViewport(
      "cursor",
      790,
      590,
      100,
      24,
      800,
      600,
    );
    expect(left).toBe(692);
    expect(top).toBe(568);
  });
});
