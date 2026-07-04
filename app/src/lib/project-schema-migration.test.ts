import { describe, expect, it } from "vitest";
import { parseProjectData } from "./project-schema";

/** Minimal valid v1 project wrapper around a set of raw v1 cues. */
function v1Project(cues: unknown[]) {
  return {
    version: 1,
    id: "00000000-0000-4000-8000-000000000001",
    name: "clip.mp4",
    videoName: "clip.mp4",
    fpsNumerator: 25,
    fpsDenominator: 1,
    startTimecode: "00:00:00:00",
    referenceStartSeconds: 0,
    defaultShot: "ON",
    shots: [{ id: "ON", label: "On" }],
    speakers: [{ id: "SPEAKER_00", name: "A", color: "#fff" }],
    cues,
  };
}

const w = (text: string, start: number, end: number) => ({ text, start, end });

describe("v1 -> v2 migration", () => {
  it("bumps version and keeps a single-range cue as one cue", () => {
    const project = parseProjectData(
      v1Project([
        {
          id: "c1",
          start: 0,
          end: 2,
          speakerId: "SPEAKER_00",
          words: [w("hello", 0, 1), w("world", 1, 2)],
          lineBreakAfterWordIndices: [],
          shotRanges: [{ fromWord: 0, toWord: 1, shot: "OFF" }],
        },
      ]),
    );

    expect(project.version).toBe(2);
    expect(project.cues).toHaveLength(1);
    const cue = project.cues[0];
    expect(cue.shot).toBe("OFF");
    expect(cue.joinedToPrev).toBeUndefined();
    expect("shotRanges" in cue).toBe(false);
    expect(cue.words.map((x) => x.text)).toEqual(["hello", "world"]);
  });

  it("defaults shot to defaultShot when a cue has no ranges", () => {
    const project = parseProjectData(
      v1Project([
        {
          id: "c1",
          start: 0,
          end: 2,
          speakerId: null,
          words: [w("hi", 0, 2)],
          lineBreakAfterWordIndices: [],
          shotRanges: [],
        },
      ]),
    );
    expect(project.cues).toHaveLength(1);
    expect(project.cues[0].shot).toBe("ON");
  });

  it("splits a multi-range cue into a joined run", () => {
    const project = parseProjectData(
      v1Project([
        {
          id: "c1",
          start: 0,
          end: 3,
          speakerId: "SPEAKER_00",
          words: [w("a", 0, 1), w("b", 1, 2), w("c", 2, 3)],
          lineBreakAfterWordIndices: [1],
          shotRanges: [
            { fromWord: 0, toWord: 0, shot: "ON" },
            { fromWord: 1, toWord: 2, shot: "OFF" },
          ],
        },
      ]),
    );

    expect(project.cues).toHaveLength(2);
    const [first, second] = project.cues;

    // first cue keeps id + speaker, no joinedToPrev
    expect(first.id).toBe("c1");
    expect(first.shot).toBe("ON");
    expect(first.speakerId).toBe("SPEAKER_00");
    expect(first.joinedToPrev).toBeUndefined();
    expect(first.words.map((x) => x.text)).toEqual(["a"]);
    expect(first.lineBreakAfterWordIndices).toEqual([]);

    // second cue is joined, speaker cleared, break rebased to local index 0
    expect(second.shot).toBe("OFF");
    expect(second.speakerId).toBeNull();
    expect(second.joinedToPrev).toBe(true);
    expect(second.words.map((x) => x.text)).toEqual(["b", "c"]);
    expect(second.lineBreakAfterWordIndices).toEqual([0]);

    // run abuts internally and preserves the original outer span
    expect(first.start).toBe(0);
    expect(first.end).toBe(second.start);
    expect(second.end).toBe(3);
  });

  it("still validates a native v2 project without migrating", () => {
    const project = parseProjectData({
      ...v1Project([]),
      version: 2,
      cues: [
        {
          id: "c1",
          start: 0,
          end: 2,
          speakerId: null,
          words: [w("hi", 0, 2)],
          lineBreakAfterWordIndices: [],
          shot: "ON",
        },
      ],
    });
    expect(project.version).toBe(2);
    expect(project.cues[0].shot).toBe("ON");
  });

  it("rejects a v2 cue that still carries shotRanges", () => {
    expect(() =>
      parseProjectData({
        ...v1Project([]),
        version: 2,
        cues: [
          {
            id: "c1",
            start: 0,
            end: 2,
            speakerId: null,
            words: [],
            lineBreakAfterWordIndices: [],
            shot: "ON",
            shotRanges: [{ fromWord: 0, toWord: 0, shot: "ON" }],
          },
        ],
      }),
    ).toThrow(/Not a valid Subbit project file/);
  });
});
