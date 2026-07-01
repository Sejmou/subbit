import type { Project } from "../types";
import type { DeliveryColumnMapping } from "./delivery-columns";
import { DEFAULT_DELIVERY_COLUMNS } from "./delivery-columns";
import { buildDeliveryRows } from "./delivery-rows";

export type Delimiter = "\t" | ",";

/** Quote a field for comma-CSV per RFC 4180; tab output is left as-is. */
function escapeField(value: string, delimiter: Delimiter): string {
  if (delimiter === ",") {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  // Tab-separated: strip tabs/newlines that would break the row.
  return value.replace(/[\t\r\n]+/g, " ");
}

/**
 * Build the delivery CSV/TSV. Each cue is one row with SMPTE timecodes
 * (project fps + start timecode) and " / "-joined shots/text for mixed-shot cues.
 */
export function exportCsv(
  project: Project,
  delimiter: Delimiter = "\t",
  columns: DeliveryColumnMapping = DEFAULT_DELIVERY_COLUMNS,
): string {
  const rows = buildDeliveryRows(project, columns);

  return rows
    .map((row) => row.map((f) => escapeField(f, delimiter)).join(delimiter))
    .join("\r\n");
}
