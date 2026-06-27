import { MOD_LABEL } from "./mod-label";
import { SHORTCUTS } from "./registry";

export interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const GROUP_ORDER = [
  "Playback & navigation",
  "Program sync",
  "Timing",
  "Metadata",
  "Text & structure",
  "Project",
] as const;

/** Help-overlay rows derived from the shortcut registry (no duplicate ids). */
export function shortcutGroups(mod: string = MOD_LABEL): ShortcutGroup[] {
  const byGroup = new Map<string, { keys: string; description: string }[]>();
  const seenIds = new Set<string>();

  for (const def of SHORTCUTS) {
    if (def.showInHelp === false) continue;
    if (seenIds.has(def.id)) continue;
    seenIds.add(def.id);

    const keys = typeof def.label === "function" ? def.label(mod) : def.label;
    const list = byGroup.get(def.group) ?? [];
    list.push({ keys, description: def.description });
    byGroup.set(def.group, list);
  }

  return GROUP_ORDER.filter((title) => byGroup.has(title)).map((title) => ({
    title,
    shortcuts: byGroup.get(title)!,
  }));
}
