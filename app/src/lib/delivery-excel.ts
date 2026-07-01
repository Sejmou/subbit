import ExcelJS from "exceljs";
import type { Project } from "../types";
import type { DeliveryColumnMapping } from "./delivery-columns";
import { DEFAULT_DELIVERY_COLUMNS } from "./delivery-columns";
import {
  applyDeliveryImport,
  buildDeliveryRows,
  type DeliveryRowValues,
} from "./delivery-rows";

function toArrayBuffer(data: ExcelJS.Buffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const bytes = new Uint8Array(data as ArrayBufferLike);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("result" in value) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
  }
  return String(value).trim();
}

function rowValues(row: ExcelJS.Row): string[] {
  const values: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    while (values.length < colNumber - 1) values.push("");
    values[colNumber - 1] = cellToString(cell.value);
  });
  return values;
}

function findHeaderRowIndex(
  sheet: ExcelJS.Worksheet,
  columns: DeliveryColumnMapping,
): number {
  const required = [columns.timecodeIn, columns.timecodeOut, columns.subtitle];
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const values = rowValues(row).map((v) => v.trim());
    if (required.every((name) => values.includes(name))) return i;
  }
  throw new Error(
    `Could not find a header row with columns: ${required.join(", ")}`,
  );
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

/** Parse the first worksheet of an Excel delivery file into row values. */
export async function parseDeliveryExcel(
  data: ArrayBuffer,
  columns: DeliveryColumnMapping = DEFAULT_DELIVERY_COLUMNS,
): Promise<DeliveryRowValues[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheets");

  const headerRowIndex = findHeaderRowIndex(sheet, columns);
  const headerValues = rowValues(sheet.getRow(headerRowIndex));
  const idx = {
    no: columnIndex(headerValues, columns.no),
    timecodeIn: columnIndex(headerValues, columns.timecodeIn),
    timecodeOut: columnIndex(headerValues, columns.timecodeOut),
    role: columnIndex(headerValues, columns.role),
    info: columnIndex(headerValues, columns.info),
    subtitle: columnIndex(headerValues, columns.subtitle),
  };

  const rows: DeliveryRowValues[] = [];
  for (let i = headerRowIndex + 1; i <= sheet.rowCount; i++) {
    const values = rowValues(sheet.getRow(i));
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

/** Import delivery spreadsheet bytes into an existing project. */
export async function importDeliveryExcel(
  project: Project,
  data: ArrayBuffer,
  columns: DeliveryColumnMapping = DEFAULT_DELIVERY_COLUMNS,
): Promise<Project> {
  const rows = await parseDeliveryExcel(data, columns);
  return applyDeliveryImport(project, rows);
}

/** Write delivery spreadsheet bytes from a project. */
export async function exportDeliveryExcel(
  project: Project,
  columns: DeliveryColumnMapping = DEFAULT_DELIVERY_COLUMNS,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  for (const row of buildDeliveryRows(project, columns)) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return toArrayBuffer(buffer);
}

export type { DeliveryRowValues };
