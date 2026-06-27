import { create } from "zustand";
import {
  getKeyboardLayoutVersion,
  initKeyboardLayout,
} from "../lib/keyboard-layout";

interface KeyboardLayoutState {
  version: number;
  hydrate: () => Promise<void>;
}

export const useKeyboardLayoutStore = create<KeyboardLayoutState>((set) => ({
  version: getKeyboardLayoutVersion(),
  hydrate: async () => {
    await initKeyboardLayout();
    set({ version: getKeyboardLayoutVersion() });
  },
}));
