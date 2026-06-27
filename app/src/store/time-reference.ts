import { create } from "zustand";
import {
  readTimeReference,
  writeTimeReference,
} from "../lib/time-reference-settings";

export type TimeReference = "file" | "program";

interface TimeReferenceState {
  reference: TimeReference;
  setReference: (reference: TimeReference) => void;
}

export const useTimeReference = create<TimeReferenceState>((set) => ({
  reference: readTimeReference(),
  setReference: (reference) => {
    writeTimeReference(reference);
    set({ reference });
  },
}));
