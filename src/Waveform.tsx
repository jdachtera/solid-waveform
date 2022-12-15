import { JSX, mergeProps, Show } from "solid-js";
import { onCleanup, onMount, createEffect, createMemo, createSignal, splitProps } from "solid-js";

import createCachedWaveformPeaks from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";
import { clamp } from "./helpers";
import { WaveformContext, WaveformContextProvider } from "./context";
import { createStore } from "solid-js/store";

const Waveform = (
  allProps: {
    buffer?: AudioBuffer;
    position: number;
    zoom: number;
    scale: number;
    strokeStyle?: string | CanvasGradient | CanvasPattern;
    logScale?: boolean;

    onPositionChange?: (position: number) => void;
    onZoomChange?: (position: number) => void;
    onScaleChange?: (scale: number) => void;
  } & JSX.IntrinsicElements["div"],
) => {
  const propsWithDefauls = mergeProps({ logScale: false }, allProps);
  const [props, divProps] = splitProps(propsWithDefauls, [
    "strokeStyle",
    "buffer",
    "position",
    "zoom",
    "scale",
    "logScale",
    "onScaleChange",
    "onPositionChange",
    "onZoomChange",
    "children",
  ]);

  let scrollbarDivRef: HTMLDivElement | undefined;
  let contentDivRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;

  const rawData = createMemo(() => props.buffer?.getChannelData(0));
  const duration = createMemo(() => props.buffer?.duration ?? 0);
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

  const cachedWaveformPeaks = createMemo(() => createCachedWaveformPeaks(rawData() ?? []));

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

  createEffect(() => {
    if (!context) return;

    const { height, width } = canvasDimensions();

    const dpi = window.devicePixelRatio;

    canvasRef?.setAttribute("width", (width * dpi).toString());
    canvasRef?.setAttribute("height", (height * dpi).toString());

    context.scale(dpi, dpi);
  });

  createEffect(() => {
    if (!dataLength()) return;
    const { height, width } = canvasDimensions();

    const samplesPerPx = visibleLength() / width;
    const start = Math.floor((props.position / duration()) * (dataLength() / samplesPerPx));
    const end = start + width;
    const peaksOpacity = clamp(Math.log(samplesPerPx / 35) - 0.5, 0, 1);
    const scale = props.scale;
    const strokeStyle = props.strokeStyle;
    const logScale = props.logScale;

    requestAnimationFrame(async () => {
      if (!context) return;

      const peaks = await cachedWaveformPeaks().getPeaks({
        samplesPerPx,
        start,
        end,
      });

      drawWaveformWithPeaks({
        context,

        peaks,
        width,
        height,
        scale,

        peaksOpacity,
        strokeStyle,
        logScale,
      });
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

    if (!scrollbarDivRef?.parentElement || !contentDivRef) return;

    const contentDivWidth = clamp(props.zoom * width, width, 16777214);
    const contentDivScrollLeft = scrollAmount * (contentDivWidth - width);

    const scrollDivWidth = clamp(contentDivWidth, width, 16777214);
    const scrollLeft = scrollAmount * (scrollDivWidth - width);

    didUpdateScrollLeft = true;

    scrollbarDivRef.parentElement.scrollTo(scrollLeft, 0);
    scrollbarDivRef.style.width = `${scrollDivWidth}px`;

    contentDivRef.style.marginLeft = `${-contentDivScrollLeft}px`;
    contentDivRef.style.width = `${contentDivWidth}px`;
  });

  createEffect(() => {
    cachedWaveformPeaks().warmup((progress) => setProgress(progress));
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
          height: "100%",
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
          "overflow-x": "hidden",
        }}
      >
        <div
          class="Waveform-Content"
          ref={contentDivRef}
          style={{ height: "100%", position: "relative" }}
        >
          <WaveformContextProvider value={contextValue}>{props.children}</WaveformContextProvider>
        </div>
      </div>
    </div>
  );
};

export default Waveform;
