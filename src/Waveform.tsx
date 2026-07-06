import { JSX, mergeProps, Show } from "solid-js";
import { onCleanup, onMount, createEffect, createMemo, createSignal, splitProps } from "solid-js";

import createCachedWaveformSource, { WaveformMode, WaveformData } from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";
import { clamp } from "./helpers";
import { WaveformContext, WaveformContextProvider } from "./context";
import { createStore } from "solid-js/store";

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

  onPositionChange?: (position: number) => void;
  onZoomChange?: (position: number) => void;
  onScaleChange?: (scale: number) => void;
} & JSX.IntrinsicElements["div"];

const Waveform = (allProps: WaveformProps) => {
  const propsWithDefauls = mergeProps(
    { logScale: false, mode: "peak" as WaveformMode, lineWidth: 1 },
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

  const observer = new ResizeObserver(updateDimensions);

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

  // The last successful draw's arguments, so a resize can REPAINT immediately.
  // Setting a canvas's width/height clears its backing store, and our real draw is
  // async (requestAnimationFrame + await getValues) — that gap showed a blank
  // canvas on every resize (the flicker). Repainting the cached peaks synchronously
  // right after resizing bridges the gap until the fresh async draw lands.
  let lastDrawArgs: Parameters<typeof drawWaveformWithPeaks>[0] | undefined;

  createEffect(() => {
    if (!context) return;

    const { height, width } = canvasDimensions();

    const dpi = window.devicePixelRatio;

    // Setting width/height resets the backing store AND the 2d transform.
    canvasRef?.setAttribute("width", (width * dpi).toString());
    canvasRef?.setAttribute("height", (height * dpi).toString());

    context.scale(dpi, dpi);

    // No blank frame: redraw the last peaks at the new size right away.
    if (lastDrawArgs && width && height)
      drawWaveformWithPeaks({ ...lastDrawArgs, context, width, height });
  });

  let animationFrame: number;
  let animationFrameScheduleTime = 0;
  createEffect(() => {
    if (!dataLength()) return;
    if (!context) return;
    const { height, width } = canvasDimensions();
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

    const deltaX = event.altKey ? event.deltaY : event.deltaX;
    const deltaY = event.altKey ? event.deltaX : event.deltaY;

    if (event.shiftKey) {
      const newScale = clamp(props.scale * (1 + deltaY / height), 0.1, 5);
      props.onScaleChange?.(newScale);
    } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const maxPosition = duration() - duration() / props.zoom;
      const newPosition = clamp(
        props.position + (deltaX / width / props.zoom) * 1000,
        0,
        maxPosition,
      );

      props.onPositionChange?.(newPosition);
    } else {
      const maxZoom = (dataLength() / width) * 50 * window.devicePixelRatio;
      const newZoom = clamp(props.zoom * (1 + deltaY / height), 1, maxZoom);
      const zoomedLength = duration() / props.zoom;

      const pointerPositionPercentage = (event.clientX - left) / width;
      const pointerPosition = props.position + zoomedLength * pointerPositionPercentage;

      const newZoomedLength = duration() / newZoom;

      const maxPosition = duration() - duration() / newZoom;
      const newPosition = clamp(
        pointerPosition - pointerPositionPercentage * newZoomedLength,
        0,
        maxPosition,
      );

      props.onZoomChange?.(newZoom);
      props.onPositionChange?.(newPosition);
    }
  };

  const handleScroll = (event: UIEvent & { currentTarget: Element }) => {
    event.preventDefault();
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
    dimensions: canvasDimensions(),
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
