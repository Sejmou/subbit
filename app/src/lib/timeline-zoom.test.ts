import { describe, expect, it } from "vitest";
import {
  applyInitialTimelineZoom,
  applyTimelineFitWidth,
  applyTimelineZoom,
  applyTimelineZoomByFactor,
  DEFAULT_TIMELINE_VISIBLE_SPAN_SECONDS,
  effectiveTimelineDuration,
  resolveTimelineVisibleSpan,
  timelineViewStartTime,
  timelineViewWidthPx,
  timelineWheelAnchorRatio,
  TIMELINE_ZOOM_IN_FACTOR,
  type TimelineZoomView,
} from "./timeline-zoom";

const meta = { samplesPerPixel: 551, sampleRate: 44100 };

function mockView(
  start: number,
  end: number,
  opts?: { spanAfterZoom?: number },
): TimelineZoomView & {
  zoomCalls: Array<{ seconds: number }>;
  startCalls: number[];
} {
  let startTime = start;
  let endTime = end;
  const zoomCalls: Array<{ seconds: number }> = [];
  const startCalls: number[] = [];
  return {
    zoomCalls,
    startCalls,
    getStartTime: () => startTime,
    getEndTime: () => endTime,
    setZoom: (options) => {
      zoomCalls.push(options);
      const span =
        opts?.spanAfterZoom ?? options.seconds ?? (endTime - startTime) * 0.75;
      const center = (startTime + endTime) / 2;
      startTime = center - span / 2;
      endTime = center + span / 2;
    },
    setStartTime: (seconds) => {
      startCalls.push(seconds);
      const span = endTime - startTime;
      startTime = seconds;
      endTime = seconds + span;
    },
  };
}

describe("resolveTimelineVisibleSpan", () => {
  it("returns requested span when within peaks and duration limits", () => {
    expect(resolveTimelineVisibleSpan(meta, 30, 3600, 3600, 1920)).toBeCloseTo(
      30,
    );
  });

  it("caps zoom-in at peaks native minimum span", () => {
    const width = 800;
    const minSpan = (800 * 551) / 44100;
    expect(resolveTimelineVisibleSpan(meta, 10, 3600, 3600, width)).toBeCloseTo(
      minSpan,
    );
  });

  it("caps zoom-out at duration", () => {
    expect(resolveTimelineVisibleSpan(meta, 4000, 3000, 3600, 1920)).toBe(3600);
  });

  it("cannot zoom out below peaks native minimum span", () => {
    expect(resolveTimelineVisibleSpan(meta, 30, 3600, 20, 1920)).toBeCloseTo(
      (1920 * 551) / 44100,
    );
  });

  it("returns null for invalid width", () => {
    expect(resolveTimelineVisibleSpan(meta, 30, 3600, 3600, 0)).toBeNull();
  });
});

describe("timelineViewStartTime", () => {
  it("centers anchor time by default", () => {
    expect(timelineViewStartTime(30, 3600, 100)).toBeCloseTo(85);
  });

  it("keeps anchor under cursor when ratio is not 0.5", () => {
    expect(timelineViewStartTime(40, 3600, 120, 0.25)).toBeCloseTo(110);
  });

  it("clamps to file start", () => {
    expect(timelineViewStartTime(30, 3600, 5)).toBe(0);
  });

  it("clamps to file end", () => {
    expect(timelineViewStartTime(30, 3600, 3595)).toBeCloseTo(3570);
  });
});

describe("applyTimelineZoom", () => {
  it("zooms to requested span and centers on anchor", () => {
    const view = mockView(0, 3600, { spanAfterZoom: 30 });
    expect(
      applyTimelineZoom(view, meta, {
        requestedSpanSeconds: 30,
        durationSeconds: 3600,
        viewWidthPx: 1920,
        anchorTimeSeconds: 100,
      }),
    ).toBe(true);
    expect(view.zoomCalls).toEqual([{ seconds: 30 }]);
    expect(view.startCalls[0]).toBeCloseTo(85);
  });

  it("returns false when already at requested span", () => {
    const view = mockView(85, 115, { spanAfterZoom: 30 });
    expect(
      applyTimelineZoom(view, meta, {
        requestedSpanSeconds: 30,
        durationSeconds: 3600,
        viewWidthPx: 1920,
        anchorTimeSeconds: 100,
      }),
    ).toBe(false);
    expect(view.zoomCalls).toHaveLength(0);
  });

  it("zooms in toward requested span", () => {
    const view = mockView(0, 120, { spanAfterZoom: 90 });
    expect(
      applyTimelineZoom(view, meta, {
        requestedSpanSeconds: 90,
        durationSeconds: 3600,
        viewWidthPx: 800,
        anchorTimeSeconds: 60,
      }),
    ).toBe(true);
    expect(view.zoomCalls).toEqual([{ seconds: 90 }]);
  });

  it("preserves wheel-zoom anchor ratio", () => {
    const view = mockView(100, 220, { spanAfterZoom: 90 });
    expect(
      applyTimelineZoom(view, meta, {
        requestedSpanSeconds: 90,
        durationSeconds: 3600,
        viewWidthPx: 800,
        anchorTimeSeconds: 130,
        anchorRatio: 0.25,
      }),
    ).toBe(true);
    expect(view.startCalls[0]).toBeCloseTo(
      timelineViewStartTime(90, 3600, 130, 0.25),
    );
  });
});

describe("applyTimelineZoomByFactor", () => {
  it("zooms by factor with wheel anchor", () => {
    const view = mockView(100, 220, { spanAfterZoom: 90 });
    expect(
      applyTimelineZoomByFactor(view, meta, TIMELINE_ZOOM_IN_FACTOR, {
        durationSeconds: 3600,
        viewWidthPx: 480,
        anchorXPx: 120,
      }),
    ).toBe(true);
    expect(view.zoomCalls).toEqual([{ seconds: 90 }]);
    expect(view.startCalls[0]).toBeCloseTo(
      timelineViewStartTime(90, 3600, 130, 0.25),
    );
  });
});

describe("applyInitialTimelineZoom", () => {
  it("opens at the default visible span on the playhead", () => {
    const view = mockView(0, 3600, { spanAfterZoom: 30 });
    expect(
      applyInitialTimelineZoom(view, meta, {
        durationSeconds: 3600,
        viewWidthPx: 1920,
        playheadSeconds: 100,
      }),
    ).toBe(true);
    expect(view.zoomCalls).toEqual([
      { seconds: DEFAULT_TIMELINE_VISIBLE_SPAN_SECONDS },
    ]);
    expect(view.startCalls[0]).toBeCloseTo(85);
  });
});

describe("applyTimelineFitWidth", () => {
  it("zooms out to duration and fits the container", () => {
    let fitCalls = 0;
    const view = Object.assign(mockView(0, 30, { spanAfterZoom: 3600 }), {
      fitToContainer: () => {
        fitCalls += 1;
      },
    });
    expect(applyTimelineFitWidth(view, meta, 3600, 1920)).toBe(true);
    expect(view.zoomCalls).toEqual([{ seconds: 3600 }]);
    expect(fitCalls).toBe(1);
  });
});

describe("timelineViewWidthPx", () => {
  it("prefers peaks view width", () => {
    expect(timelineViewWidthPx({ getWidth: () => 1200 }, 800)).toBe(1200);
  });

  it("falls back to container width", () => {
    expect(timelineViewWidthPx({}, 800)).toBe(800);
  });
});

describe("effectiveTimelineDuration", () => {
  it("uses duration when known", () => {
    expect(effectiveTimelineDuration(3600, 30)).toBe(3600);
  });

  it("falls back to current span when duration is unknown", () => {
    expect(effectiveTimelineDuration(0, 30)).toBe(30);
  });
});

describe("timelineWheelAnchorRatio", () => {
  it("defaults to center", () => {
    expect(timelineWheelAnchorRatio(undefined, 800)).toBe(0.5);
  });

  it("maps pixel offset to ratio", () => {
    expect(timelineWheelAnchorRatio(200, 800)).toBe(0.25);
  });
});

describe("DEFAULT_TIMELINE_VISIBLE_SPAN_SECONDS", () => {
  it("is 30 seconds", () => {
    expect(DEFAULT_TIMELINE_VISIBLE_SPAN_SECONDS).toBe(30);
  });
});
