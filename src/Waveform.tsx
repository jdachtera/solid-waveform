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
import { ScrollContainer, ViewPort, WheelAction } from "solid-viewport";

// Wheel tuning. Zoom is exponential in the (device-normalized, clamped) wheel
// delta, so a mouse notch and a trackpad's stream of tiny deltas both feel right.
// ZOOM_SENSITIVITY sets the step (~1.2× per ~100px mouse notch); solid-viewport's
// own rate is VIEWPORT_ZOOM_K, so the time zoom is scaled to keep this one.
const WHEEL_LINE_PX = 16;
const ZOOM_SENSITIVITY = 0.002;
const VIEWPORT_ZOOM_K = 0.0015;

// The time axis' scroll spacer is capped, as the hand-rolled scrollbar was: at
// sample-level zoom of a long file, zoom × width is far past what a browser lays
// out. The scrollbar then moves proportionally over a larger range per pixel.
const MAX_SCROLL_SIZE = 10000;

// What the wheel does over the waveform, in solid-viewport's terms. With no
// modifier, in ONE gesture: the vertical delta zooms (anchored on the pointer) and
// the horizontal delta pans. Alt swaps them, so a wheel-only mouse can pan. A
// trackpad pinch (ctrl+wheel) only zooms. Shift is the amplitude scale, which is
// not an axis: the waveform's own handler takes it.
const wheelActions = (event: WheelEvent): WheelAction[] => {
  if (event.shiftKey) return [];
  if (event.ctrlKey) return [{ type: "zoom", axis: "time", from: "y" }];
  if (event.altKey)
    return [
      { type: "zoom", axis: "time", from: "x" },
      { type: "scroll", axis: "time", from: "y" },
    ];
  return [
    { type: "zoom", axis: "time", from: "y" },
    { type: "scroll", axis: "time", from: "x" },
  ];
};

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
  /** For progressive loading: how many samples of `data` hold audio so far.
   * Allocate `data` at its full length (duration × sample rate), fill it as the
   * audio decodes, and raise this; the waveform redraws as it grows and shades
   * the part not loaded yet (`--waveform-unloaded`). Default: all of it. */
  loadedLength?: number;
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

const Waveform = (allProps: WaveformProps): JSX.Element => {
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
    "loadedLength",
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

  const loadedLength = () => Math.min(props.loadedLength ?? dataLength(), dataLength());
  const fullyLoaded = () => loadedLength() >= dataLength();
  const cachedWaveformPeaks = createMemo(() =>
    createCachedWaveformSource(rawData() ?? [], loadedLength),
  );

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
    // Redraw as progressively loaded data arrives.
    loadedLength();

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

  // Shift + wheel scales the amplitude. Everything else on the wheel is the time
  // axis, which the ScrollContainer below handles before this sees the event.
  // The page never scrolls under the waveform.
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!event.shiftKey) return;

    const { height } = canvasDimensions();
    const deltaY =
      event.deltaMode === 1
        ? event.deltaY * WHEEL_LINE_PX
        : event.deltaMode === 2
        ? event.deltaY * (height || WHEEL_LINE_PX)
        : event.deltaY;
    props.onScaleChange?.(clamp(props.scale * Math.exp(-deltaY * ZOOM_SENSITIVITY), 0.1, 5));
  };

  // Where the not-yet-loaded part starts on screen, clamped to the canvas.
  const unloadedLeft = () => {
    const { width } = canvasDimensions();
    const visible = duration() / props.zoom;
    const loadedTime = dataLength() ? (loadedLength() / dataLength()) * duration() : 0;
    return clamp(((loadedTime - props.position) / visible) * width, 0, width);
  };

  // Deep enough that a pixel spans about 1/50 of a sample (on this display), past
  // which there is nothing left to see.
  const maxZoom = () => {
    const { width } = canvasDimensions();
    return width ? Math.max(1, (dataLength() / width) * 50 * window.devicePixelRatio) : Infinity;
  };

  createEffect(() => {
    // Pre-filling the cache from half-loaded data would only cache silence.
    if (!fullyLoaded()) return;
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

      {/* The part of the timeline whose audio hasn't arrived yet. */}
      <Show when={!fullyLoaded() && duration() > 0}>
        <div
          class="Waveform-Unloaded"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            left: `${unloadedLeft()}px`,
            background:
              "var(--waveform-unloaded, repeating-linear-gradient(-45deg, rgba(127,127,127,0.1) 0 8px, rgba(127,127,127,0.04) 8px 16px))",
            "pointer-events": "none",
          }}
        />
      </Show>

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

      <ViewPort
        axes={{
          time: () => ({
            position: props.position,
            range: duration(),
            pixelOffset: canvasDimensions().left,
            pixelSize: canvasDimensions().width,
            zoom: props.zoom,
            minZoom: 1,
            maxZoom: maxZoom(),
            onPositionChange: props.onPositionChange,
            onZoomChange: props.onZoomChange,
          }),
        }}
      >
        {/* Pans and zooms the time axis: the wheel (see wheelActions), its own
            scrollbar, one finger to pan and two to pinch on touch. The canvas
            underneath is drawn from the same position and zoom. */}
        <ScrollContainer
          class="Waveform-Scroller"
          horizontalAxis="time"
          wheel={wheelActions}
          pinch="horizontal"
          nativeScrollbars
          maxScrollSize={MAX_SCROLL_SIZE}
          // The waveform's default is scroll down = zoom in, solid-viewport's the
          // opposite.
          invertZoom={!props.invertZoom}
          zoomSensitivity={
            (props.zoomSensitivity > 0 ? props.zoomSensitivity : 1) *
            (ZOOM_SENSITIVITY / VIEWPORT_ZOOM_K)
          }
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            "z-index": 1,
            "overflow-y": "hidden",
          }}
        >
          <div class="Waveform-Content" style={{ height: "100%", position: "relative" }}>
            <WaveformContextProvider value={contextValue}>{props.children}</WaveformContextProvider>
          </div>
        </ScrollContainer>
      </ViewPort>
    </div>
  );
};

export default Waveform;
