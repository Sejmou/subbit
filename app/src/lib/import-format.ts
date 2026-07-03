import type { Project } from "../types";
import type { DeliveryColumnMapping } from "./delivery-columns";
import { DEFAULT_DELIVERY_COLUMNS } from "./delivery-columns";
import { applyDeliveryImport } from "./delivery-rows";
import { importDeliveryExcel } from "./delivery-excel";
import { parseAss } from "./import-ass";
import { parseDeliveryCsv } from "./import-delivery-csv";
import { parseSrt } from "./import-srt";
import { parseVtt } from "./import-vtt";
import { applySubtitleImport } from "./subtitle-blocks";
import {
  exportFormatInfo,
  type ExportFormat,
  type ExportRequest,
} from "./export-format";

export type ImportRequest = Pick<ExportRequest, "format" | "deliveryColumns">;

export function defaultImportRequest(
  format: ExportFormat = "ass",
): ImportRequest {
  return {
    format,
    deliveryColumns: { ...DEFAULT_DELIVERY_COLUMNS },
  };
}

export function importAcceptForFormat(format: ExportFormat): string {
  const info = exportFormatInfo(format);
  if (format === "xlsx") {
    return `.${info.ext},${info.mime}`;
  }
  return `.${info.ext}`;
}

/** Import subtitle file bytes into an existing project (replaces cues). */
export async function importSubtitleFile(
  project: Project,
  request: ImportRequest,
  data: string | ArrayBuffer,
): Promise<Project> {
  const { format, deliveryColumns } = request;

  switch (format) {
    case "srt":
      return applySubtitleImport(project, parseSrt(asText(data)));
    case "vtt":
      return applySubtitleImport(project, parseVtt(asText(data)));
    case "ass":
      return applySubtitleImport(project, parseAss(asText(data)));
    case "csv":
      return applyDeliveryImport(
        project,
        parseDeliveryCsv(asText(data), ",", deliveryColumns),
      );
    case "tsv":
      return applyDeliveryImport(
        project,
        parseDeliveryCsv(asText(data), "\t", deliveryColumns),
      );
    case "xlsx":
      return importDeliveryExcel(project, asArrayBuffer(data), deliveryColumns);
  }
}

function asText(data: string | ArrayBuffer): string {
  if (typeof data === "string") return data;
  return new TextDecoder().decode(data);
}

function asArrayBuffer(data: string | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return new TextEncoder().encode(data).buffer;
}
