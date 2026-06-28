import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

interface Props {
  open: boolean;
  title: string;
  message: string;
  okLabel?: string;
  onClose: () => void;
}

/** Single-action notice modal (Escape or backdrop closes). */
export function NoticeDialog({
  open,
  title,
  message,
  okLabel = "OK",
  onClose,
}: Props) {
  const modalRef = useModalFocusTrap(open, onClose);

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        ref={modalRef}
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notice-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="notice-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="primary" onClick={onClose}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
