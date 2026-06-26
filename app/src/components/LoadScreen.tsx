import { useRef } from 'react'

interface Props {
  fsSupported: boolean
  movieName: string | null
  hasSubtitles: boolean
  canRestore: boolean
  busy: string | null
  onPickMovie: () => void
  onPickSubtitles: () => void
  onMovieFile: (file: File) => void
  onSubtitlesFile: (file: File) => void
  onRestore: () => void
  onStart: () => void
}

export function LoadScreen(props: Props) {
  const movieInput = useRef<HTMLInputElement>(null)
  const subtitlesInput = useRef<HTMLInputElement>(null)
  const fs = props.fsSupported

  return (
    <div className="load-screen">
      <div className="load-card">
        <h1>Subbit</h1>
        <p className="sub">Subtitle editor with speaker &amp; shot metadata.</p>

        {props.canRestore && (
          <button className="primary wide" onClick={props.onRestore} disabled={!!props.busy}>
            Reopen last session
          </button>
        )}

        <ol className="steps">
          <li>
            <span>1. Movie</span>
            <button
              onClick={fs ? props.onPickMovie : () => movieInput.current?.click()}
              disabled={!!props.busy}
            >
              {props.movieName ?? 'Choose movie.mp4'}
            </button>
            <input
              ref={movieInput}
              type="file"
              accept="video/mp4,video/*"
              hidden
              onChange={(e) => e.target.files?.[0] && props.onMovieFile(e.target.files[0])}
            />
          </li>

          <li>
            <span>2. Subtitles (optional)</span>
            <button
              onClick={fs ? props.onPickSubtitles : () => subtitlesInput.current?.click()}
              disabled={!!props.busy}
            >
              Choose whisperx JSON or project
            </button>
            <input
              ref={subtitlesInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && props.onSubtitlesFile(e.target.files[0])}
            />
            <span className="step-note">
              {props.hasSubtitles ? (
                <span className="ok">loaded</span>
              ) : (
                'Optional — import whisperx or a saved project, or start with a blank project.'
              )}
            </span>
          </li>
        </ol>

        <button
          className="primary wide"
          disabled={!props.movieName || !!props.busy}
          onClick={props.onStart}
        >
          {props.busy ?? 'Start editing'}
        </button>

        <p className="hint">Press ? anytime for keyboard shortcuts.</p>

        {!fs && (
          <p className="hint">
            Your browser can't save files in place. Use Chrome or Edge for the best experience;
            otherwise you'll download the project/exports manually.
          </p>
        )}
      </div>
    </div>
  )
}
