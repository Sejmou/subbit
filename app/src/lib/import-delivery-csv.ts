import type { DeliveryColumnMapping } from "./delivery-columns";
import { DEFAULT_DELIVERY_COLUMNS } from "./delivery-columns";
import type { DeliveryRowValues } from "./delivery-rows";
import type { Delimiter } from "./export-csv";

function parseDelimitedRow(line: string, delimiter: Delimiter): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((field) => field.trim());
  }

  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function columnIndex(values: string[], name: string): number {
  const idx = values.findIndex((v) => v.trim() === name.trim());
  if (idx < 0) {
    throw new Error(`Missing column "${name}" in spreadsheet header`);
  }
  return idx;
}

function readCell(values: string[], index: number | undefined): string {
  if (index === undefined || index < 0) return "";
  return values[index]?.trim() ?? "";
}

/** Parse delivery CSV/TSV text into row values. */
export function parseDeliveryCsv(
  text: string,
  delimiter: Delimiter,
  columns: DeliveryColumnMapping = DEFAULT_DELIVERY_COLUMNS,
): DeliveryRowValues[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) throw new Error("Spreadsheet file is empty");

  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("Spreadsheet must have a header row and at least one cue");
  }

  const required = [columns.timecodeIn, columns.timecodeOut, columns.subtitle];
  let headerRowIndex = -1;
  let headerValues: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const values = parseDelimitedRow(lines[i]!, delimiter);
    if (required.every((name) => values.includes(name))) {
      headerRowIndex = i;
      headerValues = values;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error(
      `Could not find a header row with columns: ${required.join(", ")}`,
    );
  }

  const idx = {
    no: columnIndex(headerValues, columns.no),
    timecodeIn: columnIndex(headerValues, columns.timecodeIn),
    timecodeOut: columnIndex(headerValues, columns.timecodeOut),
    role: columnIndex(headerValues, columns.role),
    info: columnIndex(headerValues, columns.info),
    subtitle: columnIndex(headerValues, columns.subtitle),
  };

  const rows: DeliveryRowValues[] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const values = parseDelimitedRow(lines[i]!, delimiter);
    const subtitle = readCell(values, idx.subtitle);
    const hasContent =
      subtitle ||
      readCell(values, idx.timecodeIn) ||
      readCell(values, idx.timecodeOut) ||
      readCell(values, idx.role) ||
      readCell(values, idx.info);
    if (!hasContent) continue;

    rows.push({
      no: readCell(values, idx.no),
      timecodeIn: readCell(values, idx.timecodeIn),
      timecodeOut: readCell(values, idx.timecodeOut),
      role: readCell(values, idx.role),
      info: readCell(values, idx.info),
      subtitle,
    });
  }

  if (rows.length === 0) {
    throw new Error("Spreadsheet has no subtitle rows to import");
  }

  return rows;
}
