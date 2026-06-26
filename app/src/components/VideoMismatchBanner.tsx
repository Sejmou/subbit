interface Props {
  message: string
  onDismiss?: () => void
}

export function VideoMismatchBanner({ message, onDismiss }: Props) {
  return (
    <div className="video-mismatch-banner" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" className="video-mismatch-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}
