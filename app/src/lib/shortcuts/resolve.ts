import { isFindReplaceOpen } from "../find-replace-dialog";
import { isHelpOverlayOpen } from "../help-overlay";
import { isRolePickerOpen } from "../role-picker";
import { isSetupDialogOpen } from "../setup-dialog";
import { buildShortcutContext, type ShortcutContext } from "./context";
import { SHORTCUTS, type ShortcutDef } from "./registry";

export function resolveShortcut(
  e: globalThis.KeyboardEvent,
  ctx: ShortcutContext,
): ShortcutDef | null {
  for (const def of SHORTCUTS) {
    if (def.match(e, ctx)) return def;
  }
  return null;
}

/** Run the first matching shortcut, if any. Returns whether a shortcut handled the event. */
export function handleShortcut(e: globalThis.KeyboardEvent): boolean {
  if (isRolePickerOpen() || isSetupDialogOpen() || isHelpOverlayOpen())
    return false;
  const ctx = buildShortcutContext(e.target);
  const def = resolveShortcut(e, ctx);
  if (!def) return false;
  if (isFindReplaceOpen() && def.id !== "find-replace") return false;
  if (def.preventDefault) e.preventDefault();
  def.run(ctx, e);
  return true;
}
