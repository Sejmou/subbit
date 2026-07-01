import type { DeliveryColumnMapping } from "../lib/delivery-columns";
import { DELIVERY_COLUMN_FIELDS } from "../lib/delivery-columns";

interface Props {
  value: DeliveryColumnMapping;
  onChange: (value: DeliveryColumnMapping) => void;
}

/** Column header mapping for delivery spreadsheet import/export. */
export function DeliveryColumnMappingFields({ value, onChange }: Props) {
  return (
    <fieldset className="delivery-columns">
      <legend>Column names</legend>
      <p className="hint">
        Match the header row in your Dialogbuch spreadsheet. Defaults match the
        standard delivery layout.
      </p>
      <div className="delivery-columns-grid">
        {DELIVERY_COLUMN_FIELDS.map(({ key, label, hint }) => (
          <label key={key} className="export-field delivery-column-field">
            <span title={hint}>{label}</span>
            <input
              type="text"
              value={value[key]}
              onChange={(e) =>
                onChange({ ...value, [key]: e.target.value.trim() })
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
