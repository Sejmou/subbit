import { Line } from "konva/lib/shapes/Line";
import { Rect } from "konva/lib/shapes/Rect";
import { Text } from "konva/lib/shapes/Text";
import type { Group } from "konva/lib/Group";
import type { CreatePointMarkerOptions, PointMarker } from "peaks.js";

const LABEL_COLOR = "#eaeaea";
const TIME_LABEL_COLOR = "#aaaaaa";
const LABEL_X = 8;

type PointMarkerLayer = CreatePointMarkerOptions["layer"] & {
  formatTime: (time: number) => string;
};

type PointMarkerOptions = CreatePointMarkerOptions & {
  editable?: boolean;
  layer: PointMarkerLayer;
};

/** Peaks.js default point marker uses black labels at y=12, which clash with the axis/playhead. */
class ProgramStartPointMarker implements PointMarker {
  private _options: PointMarkerOptions;
  private _draggable: boolean;
  private _handle!: Rect;
  private _line!: Line;
  private _label: Text | null = null;
  private _time!: Text;

  constructor(options: PointMarkerOptions) {
    this._options = options;
    this._draggable = options.editable ?? false;
  }

  init(group: object) {
    const node = group as Group;
    const handleWidth = 10;
    const handleX = -5 + 0.5;

    if (this._options.view === "zoomview") {
      this._label = new Text({
        x: LABEL_X,
        y: 0,
        text: this._options.point.labelText ?? "",
        textAlign: "left",
        fontFamily: this._options.fontFamily || "sans-serif",
        fontSize: this._options.fontSize || 10,
        fontStyle: this._options.fontStyle || "normal",
        fill: LABEL_COLOR,
      });
    }

    this._handle = new Rect({
      x: handleX,
      y: 0,
      width: handleWidth,
      height: 20,
      fill: this._options.color,
      visible: this._draggable,
    });

    this._line = new Line({
      x: 0,
      y: 0,
      stroke: this._options.color,
      strokeWidth: 1,
    });

    this._time = new Text({
      x: -24,
      y: 0,
      text: this._options.layer.formatTime(this._options.point.time),
      fontFamily: this._options.fontFamily,
      fontSize: this._options.fontSize,
      fontStyle: this._options.fontStyle,
      fill: TIME_LABEL_COLOR,
      textAlign: "center",
    });
    this._time.hide();

    node.add(this._handle);
    node.add(this._line);
    if (this._label) node.add(this._label);
    node.add(this._time);
    this.fitToView();
    this.bindEventHandlers(node);
  }

  private bindEventHandlers(group: Group) {
    const showTime = () => {
      this._time.x(-24 - this._time.width());
      this._time.show();
    };
    const hideTime = () => {
      this._time.hide();
    };

    this._handle.on("mouseover touchstart", () => {
      if (this._draggable) showTime();
    });
    this._handle.on("mouseout touchend", () => {
      if (this._draggable) hideTime();
    });
    group.on("dragstart", showTime);
    group.on("dragend", hideTime);
  }

  fitToView() {
    const height = this._options.layer.getHeight();
    const midY = height / 2;

    this._line.points([0.5, 0, 0.5, height]);
    if (this._label) {
      this._label.y(midY - 5);
    }
    if (this._handle) {
      this._handle.y(midY - 10.5);
    }
    if (this._time) {
      this._time.y(midY - 5);
    }
  }

  update(
    options: Partial<
      Pick<CreatePointMarkerOptions["point"], "time" | "labelText" | "color"> & {
        editable?: boolean;
      }
    >,
  ) {
    if (options.time !== undefined) {
      this._time.setText(this._options.layer.formatTime(options.time));
    }
    if (options.labelText !== undefined && this._label) {
      this._label.text(options.labelText);
    }
    if (options.color !== undefined) {
      this._handle.fill(options.color);
      this._line.stroke(options.color);
    }
    if (options.editable !== undefined) {
      this._draggable = options.editable;
      this._handle.visible(this._draggable);
    }
  }
}

export function createProgramStartPointMarker(
  options: CreatePointMarkerOptions & { editable?: boolean },
): PointMarker {
  return new ProgramStartPointMarker(options as PointMarkerOptions);
}
