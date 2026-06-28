import { useEffect, useRef, useState } from "react";
import { MOD_LABEL, shortcutGroups } from "../lib/shortcuts";
import { setHelpOverlayOpen } from "../lib/help-overlay";
import { useKeyboardLayoutStore } from "../store/keyboard-layout";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

type HelpTab = "overview" | "shortcuts";

const HELP_TABS: { id: HelpTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
];

function HelpTutorial() {
  return (
    <div className="help-tutorial">
      <p className="hint help-tutorial-lede">
        Subbit helps you write and fix subtitles for a video on your computer.
        Your files stay local — nothing is uploaded. The app saves your work
        automatically as you go.
      </p>

      <section>
        <h3>Getting started</h3>
        <ol className="help-steps">
          <li>
            Open your <strong>video</strong>.
          </li>
          <li>
            Load existing subtitles (from a saved project or a
            speech-recognition import) or start with a blank list and add lines
            yourself.
          </li>
          <li>
            Use <strong>Save project</strong> when you want to save explicitly.
            Use <strong>Export</strong> when you need finished subtitles for
            delivery. <strong>History</strong> lets you roll back to an earlier
            save if needed.
          </li>
        </ol>
      </section>

      <section>
        <h3>The screen</h3>
        <p>
          On the left: the <strong>video</strong> and a list of{" "}
          <strong>roles</strong>
          (who speaks). On the right: the <strong>cue list</strong> — every
          subtitle line. Along the bottom: the <strong>timeline</strong>, where
          you line up text with the audio. Move anywhere in the video and the
          list and timeline follow.
        </p>
      </section>

      <section>
        <h3>Subtitle lines (cues)</h3>
        <p>
          Each row is one line that will appear on screen. It has a start time (
          <strong>In</strong>), an end time (<strong>Out</strong>), the{" "}
          <strong>text</strong>, who is speaking (<strong>role</strong>), and
          the camera shot (<strong>Info</strong>: on camera, off camera, or
          contre). Click the In or Out time to jump the video to that moment.
        </p>
        <p>
          Sometimes one line covers two shots — you will see two text boxes and
          two shot dropdowns in the same row. Tick <strong>reviewed</strong>{" "}
          when you are happy with a line. With <strong>Lock reviewed</strong> on
          (toolbar), reviewed lines cannot be edited until you untick reviewed.
          Roles are edited in the panel under the video; pick a role on each cue
          with the role button.
        </p>
      </section>

      <section>
        <h3>Which line is “selected”?</h3>
        <p>Two highlights can show at once, and they mean different things:</p>
        <ul className="help-steps help-steps--bullets">
          <li>
            <strong>Selected</strong> (lighter background) — the line you are
            working on. Change it by clicking a row or a block on the timeline,
            or step with <kbd>J</kbd> / <kbd>K</kbd>.
          </li>
          <li>
            <strong>Active</strong> (blue background) — the line the video is
            currently on. This updates as the video plays.
          </li>
        </ul>
        <p>
          They often match, but not if you have jumped somewhere else in the
          video. The bar above the timeline shows the <strong>selected</strong>
          line number; the <strong>In</strong> button (or <kbd>H</kbd>) jumps
          the video to the start of that line without playing; <kbd>L</kbd>{" "}
          jumps to the end. The button turns orange when you are not at the
          start of the selected line.
        </p>
      </section>

      <section>
        <h3>Editing text and times</h3>
        <ul className="help-steps help-steps--bullets">
          <li>
            Select a line and press <kbd>Enter</kbd> to type. Press{" "}
            <kbd>Esc</kbd> when you are done.
          </li>
          <li>
            Park the video where you want, then press <kbd>I</kbd> or{" "}
            <kbd>O</kbd> to set the start or end of the selected line to that
            spot.
          </li>
          <li>
            Press <kbd>N</kbd> to add a new line at the current moment. Click
            the video or press <kbd>Space</kbd> to play and pause.
          </li>
          <li>
            Turn on <strong>Preview</strong> in the top toolbar to see subtitles
            on the video while you watch.
          </li>
        </ul>
        <p className="hint">
          More keys (splitting lines, fine nudging, find &amp; replace) are on
          the <strong>Keyboard shortcuts</strong> tab.
        </p>
      </section>

      <section>
        <h3>The timeline</h3>
        <p>
          This is where you see timing at a glance. A narrow strip at the top
          shows the whole programme; the larger area below is the part you are
          zoomed into.
        </p>

        <h4 className="help-tutorial-subhead">What you see</h4>
        <ul className="help-steps help-steps--bullets">
          <li>
            Subtitle lines as coloured bars, often with the text written on
            them.
          </li>
          <li>
            A bright <strong>playhead</strong> line — where you are in the video
            right now. It moves with playback and stays visible as the timeline
            scrolls.
          </li>
          <li>
            An <strong>audio waveform</strong> if one has been imported (makes
            it much easier to spot words and pauses). Without it, the timeline
            still works — you just see a plain track.
          </li>
          <li>
            An orange <strong>Program start</strong> marker when your video has
            leader or black before the actual content begins.
          </li>
        </ul>

        <h4 className="help-tutorial-subhead">What you can do</h4>
        <ul className="help-steps help-steps--bullets">
          <li>
            <strong>Click</strong> a bar to select that line.{" "}
            <strong>Double-click</strong> it to select and start typing.
          </li>
          <li>
            <strong>Double-click</strong> empty space to add a new line at that
            moment.
          </li>
          <li>
            <strong>Drag</strong> the left or right edge of a bar to change when
            the line starts or ends. <strong>Drag</strong> the middle to move
            the whole line.
          </li>
          <li>
            <strong>Drag</strong> the orange Program start marker to move where
            “time zero” should be for export.
          </li>
          <li>
            Click the narrow overview strip to jump to another part of the
            video.
          </li>
        </ul>

        <h4 className="help-tutorial-subhead">Zooming and scrolling</h4>
        <ul className="help-steps help-steps--bullets">
          <li>
            <strong>Scroll</strong> on the timeline to zoom in or out. Hold{" "}
            <kbd>Shift</kbd> while scrolling to move left and right.
          </li>
          <li>
            Use <strong>−</strong>, <strong>+</strong>, and <strong>Fit</strong>{" "}
            on the right — Fit shows the entire video.
          </li>
          <li>
            The time readout shows which slice of the programme you are looking
            at. If text on the bars is hard to read, zoom in until the labels
            appear.
          </li>
        </ul>

        <p>
          Optional: click <strong>Import</strong> on the timeline to add a
          waveform file if your team provides one — it helps align lines to
          speech.
        </p>
      </section>

      <section>
        <h3>Bar above the timeline</h3>
        <ul className="help-steps help-steps--bullets">
          <li>
            <strong>Program start</strong> — set where the “real” programme
            begins if there is leader at the head. Use <strong>Set</strong> at
            the playhead, or drag the orange marker. The <strong>?</strong>{" "}
            button explains how this affects export.
          </li>
          <li>
            <strong>Playhead</strong> — the current time. Type a time and press
            Enter to jump there. <strong>File</strong> vs{" "}
            <strong>Program</strong>
            only changes how times are shown, not the subtitles themselves.
          </li>
          <li>
            Arrows and the <strong>In</strong> button — step between selected
            lines or jump to the start of the selected line.
          </li>
        </ul>
      </section>

      <section>
        <h3>Program start (leader at the head)</h3>
        <p>
          Some videos start with black, bars, or a countdown before the actual
          programme. Program start marks that hand-off. While you edit, times
          stay as they are in the file — but when you <strong>export</strong>,
          subtitle times are shifted so the moment you marked becomes “zero” for
          delivery.
        </p>
      </section>
    </div>
  );
}

function HelpShortcuts() {
  useKeyboardLayoutStore((s) => s.version);

  return (
    <>
      <p className="hint">
        Single-key shortcuts work in navigation mode (no text box focused). The{" "}
        {MOD_LABEL} combos also work while editing text.
      </p>
      <div className="help-grid">
        {shortcutGroups().map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.shortcuts.map((s) => (
                <div className="help-row" key={s.keys}>
                  <dt>
                    <kbd>{s.keys}</kbd>
                  </dt>
                  <dd>{s.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}

/** Modal help: concepts overview and keyboard shortcut reference. */
export function HelpOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<HelpTab>("overview");
  const modalRef = useModalFocusTrap(open, onClose);
  const tabRefs = useRef<Partial<Record<HelpTab, HTMLButtonElement | null>>>(
    {},
  );

  useEffect(() => {
    setHelpOverlayOpen(open);
    return () => setHelpOverlayOpen(false);
  }, [open]);

  useEffect(() => {
    if (open) setTab("overview");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "?") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  function selectTab(id: HelpTab, focus = false) {
    setTab(id);
    if (focus) tabRefs.current[id]?.focus();
  }

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const last = HELP_TABS.length - 1;
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = index < last ? index + 1 : 0;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = index > 0 ? index - 1 : last;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = last;
    } else {
      return;
    }
    e.preventDefault();
    selectTab(HELP_TABS[next].id, true);
  }

  if (!open) return null;

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div
        ref={modalRef}
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="help-modal-header">
          <div className="help-head">
            <h2 id="help-title">Help</h2>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="help-tabs" role="tablist" aria-label="Help sections">
            {HELP_TABS.map(({ id, label }, index) => {
              const selected = tab === id;
              return (
                <button
                  key={id}
                  ref={(el) => {
                    tabRefs.current[id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`help-tab-${id}`}
                  aria-selected={selected}
                  aria-controls={`help-panel-${id}`}
                  tabIndex={selected ? 0 : -1}
                  className={
                    selected ? "help-tab help-tab--active" : "help-tab"
                  }
                  onClick={() => selectTab(id)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="help-modal-body">
          {tab === "overview" ? (
            <div
              id="help-panel-overview"
              role="tabpanel"
              aria-labelledby="help-tab-overview"
            >
              <HelpTutorial />
            </div>
          ) : (
            <div
              id="help-panel-shortcuts"
              role="tabpanel"
              aria-labelledby="help-tab-shortcuts"
            >
              <HelpShortcuts />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
