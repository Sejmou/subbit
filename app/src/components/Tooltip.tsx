import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Where the tooltip is placed relative to. */
export type TipAnchor = "element" | "cursor";

const DEFAULT_DELAY_MS = 500;
const VIEWPORT_PADDING = 8;

const CURSOR_OFFSET_X = 12;
const CURSOR_OFFSET_Y = 16;
const ELEMENT_OFFSET_Y = 6;

function elementAnchor(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom,
  };
}

/** Keep tooltip box inside the viewport with a small margin. */
export function clampTooltipToViewport(
  anchor: TipAnchor,
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const minLeft = VIEWPORT_PADDING;
  const minTop = VIEWPORT_PADDING;
  const maxLeft = Math.max(minLeft, viewportWidth - VIEWPORT_PADDING - width);
  const maxTop = Math.max(minTop, viewportHeight - VIEWPORT_PADDING - height);

  if (anchor === "element") {
    let left = x - width / 2;
    left = Math.min(Math.max(left, minLeft), maxLeft);

    let top = y + ELEMENT_OFFSET_Y;
    if (top > maxTop) {
      const above = y - height - ELEMENT_OFFSET_Y;
      top = above >= minTop ? above : Math.min(Math.max(top, minTop), maxTop);
    } else {
      top = Math.min(Math.max(top, minTop), maxTop);
    }
    return { left, top };
  }

  const left = Math.min(Math.max(x + CURSOR_OFFSET_X, minLeft), maxLeft);
  const top = Math.min(Math.max(y + CURSOR_OFFSET_Y, minTop), maxTop);
  return { left, top };
}

function tooltipStyle(
  anchor: TipAnchor,
  x: number,
  y: number,
): { left: number; top: number; transform?: string } {
  if (anchor === "element") {
    return {
      left: x,
      top: y + ELEMENT_OFFSET_Y,
      transform: "translateX(-50%)",
    };
  }
  return {
    left: x + CURSOR_OFFSET_X,
    top: y + CURSOR_OFFSET_Y,
  };
}

function AppTooltip({
  label,
  x,
  y,
  anchor,
}: {
  label: string;
  x: number;
  y: number;
  anchor: TipAnchor;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState(() => tooltipStyle(anchor, x, y));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const { left, top } = clampTooltipToViewport(
      anchor,
      x,
      y,
      width,
      height,
      window.innerWidth,
      window.innerHeight,
    );
    setStyle({ left, top });
  }, [anchor, label, x, y]);

  return (
    <span ref={ref} className="app-tooltip" role="tooltip" style={style}>
      {label}
    </span>
  );
}

export type TipOptions = {
  /**
   * @default "element" — show after `delay` ms over the target, below its center.
   * `"cursor"` — show after `delay` ms of pointer stillness at the pause point;
   * any movement hides and re-arms.
   */
  anchor?: TipAnchor;
  /** Wait time before show. @default 500 */
  delay?: number;
  /** Hide as soon as the user scrolls (e.g. timeline zoom/pan). */
  hideOnWheel?: boolean;
};

export type TipProps = Pick<
  HTMLAttributes<HTMLElement>,
  "onPointerEnter" | "onPointerMove" | "onPointerLeave" | "onPointerDown"
>;

type TipFn = (label?: string, opts?: TipOptions) => TipProps;

const TooltipContext = createContext<TipFn | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState<{
    label: string;
    x: number;
    y: number;
    anchor: TipAnchor;
  } | null>(null);
  const timerRef = useRef(0);
  const visibleRef = useRef(false);
  const hideOnWheelRef = useRef(false);
  const coordsRef = useRef({ x: 0, y: 0, anchor: "element" as TipAnchor });

  const clearTimer = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }, []);

  const showAt = useCallback(
    (label: string, x: number, y: number, anchor: TipAnchor) => {
      coordsRef.current = { x, y, anchor };
      visibleRef.current = true;
      setVisible({ label, x, y, anchor });
    },
    [],
  );

  const hide = useCallback(() => {
    clearTimer();
    visibleRef.current = false;
    hideOnWheelRef.current = false;
    setVisible(null);
  }, [clearTimer]);

  const armShow = useCallback(
    (
      label: string,
      x: number,
      y: number,
      anchor: TipAnchor,
      waitMs: number,
      hideOnWheel: boolean,
    ) => {
      clearTimer();
      hideOnWheelRef.current = hideOnWheel;
      coordsRef.current = { x, y, anchor };
      timerRef.current = window.setTimeout(() => {
        const { x, y, anchor } = coordsRef.current;
        showAt(label, x, y, anchor);
      }, waitMs);
    },
    [clearTimer, showAt],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!visible) return;
    const onScroll = () => hide();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [visible, hide]);

  useEffect(() => {
    const onWheel = () => {
      if (hideOnWheelRef.current) hide();
    };
    window.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () =>
      window.removeEventListener("wheel", onWheel, { capture: true });
  }, [hide]);

  const tip = useCallback<TipFn>(
    (label, opts) => {
      if (!label) return {};
      const hideOnWheel = opts?.hideOnWheel ?? false;
      const anchor = opts?.anchor ?? "element";
      const delay = opts?.delay ?? DEFAULT_DELAY_MS;

      if (anchor === "cursor") {
        const scheduleStill = (x: number, y: number) => {
          if (visibleRef.current) {
            visibleRef.current = false;
            setVisible(null);
          }
          armShow(label, x, y, "cursor", delay, hideOnWheel);
        };

        return {
          onPointerEnter: (event: ReactPointerEvent) => {
            hide();
            scheduleStill(event.clientX, event.clientY);
          },
          onPointerMove: (event: ReactPointerEvent) => {
            scheduleStill(event.clientX, event.clientY);
          },
          onPointerLeave: hide,
          onPointerDown: hide,
        };
      }

      return {
        onPointerEnter: (event: ReactPointerEvent) => {
          const { x, y } = elementAnchor(event.currentTarget);
          armShow(label, x, y, "element", delay, hideOnWheel);
        },
        onPointerLeave: hide,
        onPointerDown: hide,
      };
    },
    [armShow, hide],
  );

  return (
    <TooltipContext.Provider value={tip}>
      {children}
      {visible &&
        createPortal(
          <AppTooltip
            label={visible.label}
            x={visible.x}
            y={visible.y}
            anchor={visible.anchor}
          />,
          document.body,
        )}
    </TooltipContext.Provider>
  );
}

/** Returns a spread helper: `{...tip("Label")}` on buttons, inputs, etc. */
export function useTip(): TipFn {
  const tip = useContext(TooltipContext);
  if (!tip) {
    throw new Error("useTip must be used within TooltipProvider");
  }
  return tip;
}
