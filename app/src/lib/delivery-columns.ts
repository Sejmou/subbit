/** Header names for delivery spreadsheet columns (Dialogbuch / export CSV). */
export interface DeliveryColumnMapping {
  no: string;
  timecodeIn: string;
  timecodeOut: string;
  role: string;
  info: string;
  subtitle: string;
}

export const DEFAULT_DELIVERY_COLUMNS: DeliveryColumnMapping = {
  no: "No",
  timecodeIn: "Timecode In",
  timecodeOut: "Timecode Out",
  role: "Rolle",
  info: "Info",
  subtitle: "Subtitle",
};

export const DELIVERY_COLUMN_FIELDS: {
  key: keyof DeliveryColumnMapping;
  label: string;
  hint?: string;
}[] = [
  { key: "no", label: "No", hint: "Row number (export only)" },
  { key: "timecodeIn", label: "Timecode In" },
  { key: "timecodeOut", label: "Timecode Out" },
  { key: "role", label: "Role (Rolle)" },
  { key: "info", label: "Info (shot)" },
  { key: "subtitle", label: "Subtitle" },
];
