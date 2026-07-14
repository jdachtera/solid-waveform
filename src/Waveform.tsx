import { JSX, mergeProps, Show } from "solid-js";
import { onCleanup, onMount, createEffect, createMemo, createSignal, splitProps } from "solid-js";

import createCachedWaveformSource, {
  WaveformMode,
  WaveformData,
} from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";
import { clamp } from "./helpers";
import { WaveformContext, WaveformContextProvider } from "./context";
import { createStore } from "solid-js/store";

// Wheel-zoom tuning. Zoom is exponential in the (device-normalized, clamped)
// wheel delta so a mouse notch and a trackpad's stream of tiny deltas both feel
// right: WHEEL_LINE_PX converts line-mode wheels to pixels; ZOOM_SENSITIVITY sets
// the step (~1.2× per ~100px mouse notch); WHEEL_MAX_PX caps a single event so one
// huge delta can't leap across the whole range.
const WHEEL_LINE_PX = 16;
const WHEEL_MAX_PX = 140;
const ZOOM_SENSITIVITY = 0.002;

// The waveform's audio source. Provide EITHER a decoded `buffer` (reads channel 0)
// OR a precomputed `data` array of mono samples (full or decimated) plus its
// `duration` in seconds — `data` lets a host keep a tiny per-source envelope
// instead of the full PCM. The props are loose optionals (not a discriminated
// union) because TS's JSX attribute checking doesn't distribute union component
// props — it validates against one member and rejects the other's keys. This type
// documents the real "one of" contract and is available for callers to enforce.
export type WaveformSource =
  | { buffer: AudioBuffer; data?: never; duration?: never }
  | { data: WaveformData; duration: number; buffer?: never };

export type WaveformProps = {
  buffer?: AudioBuffer;
  data?: WaveformData;
  duration?: number;
  position: number;
  zoom: number;
  scale: number;
  strokeStyle?: string | CanvasGradient | CanvasPattern;
  lineWidth?: number;
  logScale?: boolean;
  mode?: WaveformMode;
  /** Invert the wheel zoom direction (default: scroll up = zoom in). */
  invertZoom?: boolean;
  /** Multiplier on the wheel-zoom step (1 = default). Tune for mouse vs trackpad. */
  zoomSensitivity?: number;

  onPositionChange?: (position: number) => void;
  onZoomChange?: (position: number) => void;
  onScaleChange?: (scale: number) => void;
} & JSX.IntrinsicElements["div"];

const Waveform = (allProps: WaveformProps) => {
  const propsWithDefauls = mergeProps(
    {
      logScale: false,
      mode: "peak" as WaveformMode,
      lineWidth: 1,
      invertZoom: false,
      zoomSensitivity: 1,
    },
    allProps,
  );
  const [props, divProps] = splitProps(propsWithDefauls, [
    "strokeStyle",
    "buffer",
    "data",
    "duration",
    "position",
    "zoom",
    "scale",
    "logScale",
    "mode",
    "lineWidth",
    "invertZoom",
    "zoomSensitivity",
    "onScaleChange",
    "onPositionChange",
    "onZoomChange",
    "children",
  ]);

  let scrollbarDivRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;

  // `data` (precomputed samples) wins over `buffer`; duration comes from the
  // explicit prop, else the buffer. dataLength is whatever we're drawing from, so
  // the samples-per-pixel math scales correctly for a decimated envelope too.
  const rawData = createMemo(() => props.data ?? props.buffer?.getChannelData(0));
  const duration = createMemo(() => props.duration ?? props.buffer?.duration ?? 0);
  const endTime = createMemo(() => props.position + duration() / props.zoom);
  const dataLength = createMemo(() => rawData()?.length ?? 0);
  const visibleLength = createMemo(() =>
    Math.min(((endTime() - props.position) / duration()) * dataLength(), dataLength()),
  );

  const [canvasDimensions, setCanvasDimensions] = createSignal<
    Pick<DOMRect, "width" | "height" | "left" | "top">
  >({
    height: 0,
    width: 0,
    left: 0,
    top: 0,
  });

  const cachedWaveformPeaks = createMemo(() => createCachedWaveformSource(rawData() ?? []));

  const [progress, setProgress] = createSignal(0);

  const updateDimensions = () => {
    const { width = 0, height = 0, left = 0, top = 0 } = canvasRef?.getBoundingClientRect() ?? {};
    setCanvasDimensions({ width, height, left, top });
  };

  // rAF-coalesce the observer: a corner-drag fires it several times per frame, and
  // updateDimensions does a forced synchronous layout (getBoundingClientRect). Collapse
  // multiple ticks into ONE rect read per frame. (left/top are kept exact — they feed
  // the viewport scaler's pointer→time math, so we can't take them from contentRect.)
  let roScheduled = false;
  const observer = new ResizeObserver(() => {
    if (roScheduled) return;
    roScheduled = true;
    requestAnimationFrame(() => {
      roScheduled = false;
      updateDimensions();
    });
  });

  onMount(() => {
    context = canvasRef?.getContext("2d") ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.observe(canvasRef!);
    updateDimensions();
  });

  onCleanup(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.unobserve(canvasRef!);
  });

  // Redraw crisp on EVERY size change — no throttle, no CSS-stretch. A resize
  // frame's peaks are now derived transiently from the shared rough levels
  // (getValues store:false), so re-fetching them per frame is cheap; the only
  // real cost is the canvas realloc, and its guard below skips no-op (left/top-
  // only) changes. Pointer/region/playhead math reads the LIVE canvasDimensions()
  // so positions stay exact. (Previously throttled to ~7×/sec + CSS-stretched
  // between, which read as a choppy/blurry waveform during a dock drag.)
  const renderDims = canvasDimensions;

  // The last successful draw's arguments, so a resize can REPAINT immediately.
  // Setting a canvas's width/height clears its backing store, and our real draw is
  // async (requestAnimationFrame + await getValues) — that gap showed a blank
  // canvas on every resize (the flicker). Repainting the cached peaks synchronously
  // right after resizing bridges the gap until the fresh async draw lands.
  let lastDrawArgs: Parameters<typeof drawWaveformWithPeaks>[0] | undefined;

  createEffect(() => {
    if (!context || !canvasRef) return;

    const { height, width } = renderDims();
    const dpi = window.devicePixelRatio;
    const newW = Math.round(width * dpi);
    const newH = Math.round(height * dpi);

    // Setting width/height reallocates + CLEARS the backing store (expensive, 4× the
    // pixels on Retina). canvasDimensions() also emits for left/top-only changes
    // (window move / dock resize) that don't change our pixel size — skip the realloc
    // then. Only when the size truly changed do we reallocate + reset the transform.
    if (canvasRef.width !== newW || canvasRef.height !== newH) {
      canvasRef.width = newW;
      canvasRef.height = newH;
      context.setTransform(1, 0, 0, 1, 0, 0); // reset before re-applying dpi scale
      context.scale(dpi, dpi);
      // No blank frame: redraw the last peaks at the new size right away.
      if (lastDrawArgs && width && height)
        drawWaveformWithPeaks({ ...lastDrawArgs, context, width, height });
    }
  });

  let animationFrame: number;
  let animationFrameScheduleTime = 0;
  createEffect(() => {
    if (!dataLength()) return;
    if (!context) return;
    // Throttled during resize (matches the canvas backing store above); the live
    // canvasDimensions still drives pointer/region math elsewhere.
    const { height, width } = renderDims();
    // Canvas not measured yet (ResizeObserver hasn't fired): a width of 0 makes
    // samplesPerPx Infinity, which overflows the peak-cache recursion. Wait
    // until the canvas has a real size before drawing.
    if (!width || !height) return;

    const samplesPerPx = visibleLength() / width;
    if (!Number.isFinite(samplesPerPx) || samplesPerPx <= 0) return;
    const start = Math.floor((props.position / duration()) * (dataLength() / samplesPerPx));
    const end = start + width;
    const peaksOpacity = clamp(Math.log(samplesPerPx / 35) - 0.5, 0, 1);
    const scale = props.scale;
    const strokeStyle = props.strokeStyle;
    const logScale = props.logScale;
    const mode = props.mode;
    const sampleDotsOpacity = samplesPerPx < 100 / width ? 1 : 0;

    const now = window.performance.now();
    if (now - animationFrameScheduleTime < 0.5) {
      cancelAnimationFrame(animationFrame);
    }

    animationFrameScheduleTime = now;
    animationFrame = requestAnimationFrame(async () => {
      if (!context) return;

      const peaks = await cachedWaveformPeaks().getValues({
        samplesPerPx,
        start,
        end,
        mode,
        // Live render: derive columns transiently from the shared rough levels — no
        // per-width cache Map (which, swept over a resize, leaked + went choppy).
        store: false,
      });

      const drawArgs = {
        context,

        peaks,
        width,
        height,
        scale,

        peaksStyle: {
          opacity: peaksOpacity,
          strokeStyle,
          lineWidth: devicePixelRatio * props.lineWidth,
        },
        waveformStyle: {
          opacity: 1 - peaksOpacity,
          strokeStyle,
          lineWidth: devicePixelRatio * props.lineWidth,
        },
        sampleDotsStyle: {
          opacity: sampleDotsOpacity,
          fillStyle: strokeStyle,
          radius: props.lineWidth * devicePixelRatio * 2,
        },
        logScale,
      };

      drawWaveformWithPeaks(drawArgs);
      lastDrawArgs = drawArgs; // cached for the instant repaint-on-resize above
    });
  });

  const handleWheel = (event: WheelEvent & { currentTarget: Element }) => {
    event.preventDefault();
    const { width, height, left } = canvasDimensions();
    if (!width) return;

    // Normalize each delta to pixels: a mouse wheel reports large, infrequent
    // notches (often deltaMode=LINE), a trackpad reports many small pixel deltas.
    const px = (d: number, pageSize: number) =>
      event.deltaMode === 1
        ? d * WHEEL_LINE_PX
        : event.deltaMode === 2
        ? d * (pageSize || WHEEL_LINE_PX)
        : d;
    let deltaX = px(event.deltaX, width);
    let deltaY = px(event.deltaY, height);
    // Alt swaps the axes so a wheel-only mouse can pan (deltaY -> pan) and the
    // vertical delta drives horizontal motion.
    if (event.altKey) [deltaX, deltaY] = [deltaY, deltaX];

    // Shift = amplitude (vertical) scale, unchanged.
    if (event.shiftKey) {
      const newScale = clamp(props.scale * Math.exp(-deltaY * ZOOM_SENSITIVITY), 0.1, 5);
      props.onScaleChange?.(newScale);
      return;
    }

    // Otherwise, in ONE gesture and with no modifier: the horizontal delta pans and
    // the vertical delta zooms (anchored on the pointer) — the solid-viewport
    // "zoom-pan" model, which waveform + pianoroll need. Pan first, then anchor the
    // zoom off the panned position so the sample under the cursor stays put.
    const visible = duration() / props.zoom;
    const maxPosition = Math.max(0, duration() - visible);
    const panned =
      deltaX !== 0
        ? clamp(props.position + (deltaX / width) * visible, 0, maxPosition)
        : props.position;

    const clampedDy = clamp(deltaY, -WHEEL_MAX_PX, WHEEL_MAX_PX);
    const dir = props.invertZoom ? 1 : -1;
    const k = ZOOM_SENSITIVITY * (props.zoomSensitivity > 0 ? props.zoomSensitivity : 1);
    const factor = Math.exp(dir * -clampedDy * k); // default: scroll DOWN (dy>0) → zoom in
    const maxZoom = (dataLength() / width) * 50 * window.devicePixelRatio;
    const newZoom = clamp(props.zoom * factor, 1, maxZoom);

    // Anchor on the pointer (keep the sample under the cursor fixed), measuring from
    // the panned position at the OLD zoom.
    const pointerPct = (event.clientX - left) / width;
    const pointerPosition = panned + visible * pointerPct;
    const newZoomedLength = duration() / newZoom;
    const newMaxPosition = Math.max(0, duration() - newZoomedLength);
    const newPosition = clamp(pointerPosition - pointerPct * newZoomedLength, 0, newMaxPosition);

    if (newZoom !== props.zoom) props.onZoomChange?.(newZoom);
    if (newPosition !== props.position) props.onPositionChange?.(newPosition);
  };

  const handleScroll = (event: { currentTarget: HTMLElement }) => {
    if (didUpdateScrollLeft) {
      didUpdateScrollLeft = false;
      return;
    }

    const maxPosition = duration() - duration() / props.zoom;

    const { width } = canvasDimensions();
    const { scrollLeft, scrollWidth } = event.currentTarget;
    const scrollAmount = scrollLeft / (scrollWidth - width);

    props.onPositionChange?.(maxPosition * scrollAmount);
  };

  let didUpdateScrollLeft = false;

  createEffect(() => {
    const maxPosition = duration() - duration() / props.zoom;
    const scrollAmount = maxPosition > 0 ? props.position / maxPosition : 0;

    const { width } = canvasDimensions();

    if (!scrollbarDivRef?.parentElement) return;

    const scrollDivWidth = clamp(props.zoom * width, width, 10000);
    const scrollLeft = scrollAmount * (scrollDivWidth - width);

    didUpdateScrollLeft = true;

    scrollbarDivRef.parentElement.scrollTo(scrollLeft, 0);
    scrollbarDivRef.style.width = `${scrollDivWidth}px`;
  });

  createEffect(() => {
    cachedWaveformPeaks().warmup(props.mode, (progress) => setProgress(progress));
  });

  const getContextValue = () => ({
    duration: duration(),
    position: props.position,
    zoom: props.zoom,
    updatePosition: props.onPositionChange,
    // Throttled dimensions (same as the canvas). Region/PlayHead children reposition
    // from context.dimensions; feeding them the LIVE size made every child recompute
    // its inline left/width on every resize frame — with many regions that's the
    // dominant "style recalc" cost of a resize. renderDims only diverges from live
    // WHILE dimensions are changing (a pane resize); during a normal pointer drag on
    // the waveform it equals canvasDimensions, so hit-testing stays exact.
    dimensions: renderDims(),
  });

  const [contextValue, setContextValue] = createStore<WaveformContext>(getContextValue());

  createEffect(() => {
    setContextValue(getContextValue());
  });

  return (
    <div
      class="Waveform"
      {...divProps}
      style={{
        ...(typeof divProps.style === "object" && divProps.style),
        position: "relative",
      }}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
        }}
      />

      <Show when={!(progress() === 0 || progress() === 1)}>
        <div
          class="Waveform-Spinner"
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            "justify-content": "center",
            "align-items": "center",
            background: "rgba(0,0,0,0.1)",
          }}
        />
      </Show>

      <div
        class="Waveform-Scroller"
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          height: "16px",
          "z-index": 2,
          "overflow-x": "auto",
        }}
        onScroll={handleScroll}
      >
        <div
          class="Waveform-ScrollbarDiv"
          ref={scrollbarDivRef}
          style={{ height: "100%", position: "relative" }}
        />
      </div>

      <div
        class="Waveform-ContentContainer"
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          "z-index": 1,
          "overflow-x": "hidden",
          "touch-action": "none",
        }}
      >
        <div class="Waveform-Content" style={{ height: "100%", position: "relative" }}>
          <WaveformContextProvider value={contextValue}>{props.children}</WaveformContextProvider>
        </div>
      </div>
    </div>
  );
};

export default Waveform;
