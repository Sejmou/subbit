import { describe, expect, it, beforeEach } from "vitest";
import {
  createKeyLabeler,
  keyLabelForCode,
  setKeyboardLayoutMapForTests,
} from "./keyboard-layout";

describe("keyboard-layout", () => {
  beforeEach(() => {
    setKeyboardLayoutMapForTests(null);
  });

  it("falls back to US labels without a layout map", () => {
    expect(keyLabelForCode("BracketLeft")).toBe("[");
    expect(keyLabelForCode("KeyJ")).toBe("J");
  });

  it("uses layout map labels when available", () => {
    setKeyboardLayoutMapForTests({
      BracketLeft: "ü",
      BracketRight: "+",
      KeyY: "z",
    });
    const k = createKeyLabeler();
    expect(k.code("BracketLeft")).toBe("ü");
    expect(k.code("BracketRight")).toBe("+");
    expect(k.shift("BracketLeft")).toBe("Shift + ü");
    expect(k.code("KeyY")).toBe("z");
  });
});
