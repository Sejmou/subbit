import { describe, expect, it } from "vitest";
import { filterRoleOptions, NO_ROLE_LABEL } from "./role-picker";
import type { Speaker } from "../types";

const speakers: Speaker[] = [
  { id: "a", name: "Alice", color: "#f00" },
  { id: "b", name: "Bob", color: "#0f0" },
  { id: "c", name: "Charlie", color: "#00f" },
];

describe("filterRoleOptions", () => {
  it("returns clear option plus all roles when query is empty", () => {
    const options = filterRoleOptions(speakers, "");
    expect(options[0]).toEqual({ id: null, name: NO_ROLE_LABEL });
    expect(options).toHaveLength(4);
  });

  it("filters roles by name", () => {
    expect(filterRoleOptions(speakers, "ali")).toEqual([
      { id: "a", name: "Alice", color: "#f00" },
    ]);
  });

  it("includes clear option when query matches it", () => {
    const options = filterRoleOptions(speakers, "role");
    expect(options[0].id).toBeNull();
    expect(options.some((o) => o.id === "a")).toBe(false);
  });
});
