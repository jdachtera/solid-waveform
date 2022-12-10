import type { JSX } from "solid-js";
import {
  onCleanup,
  onMount,
  createEffect,
  createMemo,
  createSignal,
  splitProps,
  createUniqueId,
  Index,
} from "solid-js";
import { Region } from "./Region";
import createCachedWaveformPeaks from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";

export function randomColor() {
  const randR = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const randG = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const randB = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const color = `rgba(${randR},${randG},${randB},0.8)`;
  return color;
}

export const Waveform = (
  allProps: {
    buffer?: AudioBuffer;
    position: number;
    zoom: number;
    scale: number;
    regions?: Region[];
    strokeStyle?: string | CanvasGradient | CanvasPattern;
    logScale: boolean;
    onPositionChange?: (position: number) => void;
    onZoomChange?: (position: number) => void;
    onScaleChange?: (scale: number) => void;
    onCreateRegion?: (region: Region) => void;
    onUpdateRegion?: (region: Region) => void;
    onClickRegion?: (region: Region, event: MouseEvent) => void;
    onDblClickRegion?: (region: Region, event: MouseEvent) => void;
  } & JSX.IntrinsicElements["div"],
) => {
  const [props, divProps] = splitProps(allProps, [
    "strokeStyle",
    "buffer",
    "position",
    "zoom",
    "scale",
    "logScale",
    "onScaleChange",
    "onPositionChange",
    "onZoomChange",
    "onCreateRegion",
    "onUpdateRegion",
    "onClickRegion",
    "onDblClickRegion",
    "regions",
  ]);

  let animationFrame: number;
  let scrollDivRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;

  const rawData = createMemo(() => props.buffer?.getChannelData(0));
  const duration = createMemo(() => allProps.buffer?.duration ?? 0);
  const endTime = createMemo(() => props.position + duration() / props.zoom);
  const dataLength = createMemo(() => rawData()?.length ?? 0);
  const visibleLength = createMemo(() =>
    Math.min(((endTime() - props.position) / duration()) * dataLength(), dataLength()),
  );

  const [canvasDimensions, setCanvasDimensions] = createSignal<Pick<DOMRect, "width" | "height">>({
    height: 0,
    width: 0,
  });

  const cachedWaveformPeaks = createMemo(() => createCachedWaveformPeaks(rawData() ?? []));

  const [progress, setProgress] = createSignal(0);
  const [newRegion, setNewRegion] = createSignal<Region>();

  const updateDimensions = () => {
    const { width = 0, height = 0 } = canvasRef?.getBoundingClientRect() ?? {};
    setCanvasDimensions({ width, height });
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

  const getPosition = (clientX: number) => {
    const parent = scrollDivRef?.parentElement;
    if (!parent) return 0;

    const width = scrollDivRef?.clientWidth ?? 0;
    const rect = parent?.getBoundingClientRect();

    const position = ((clientX - rect.left + parent.scrollLeft) / width) * duration();

    return position;
  };

  createEffect(() => {
    if (!dataLength()) return;
    const { height, width } = canvasDimensions();

    const samplesPerPx = visibleLength() / width;
    const start = Math.floor((props.position / duration()) * (dataLength() / samplesPerPx));
    const end = start + Math.min(visibleLength(), Math.floor(width));
    const peaksOpacity = clamp(Math.log(samplesPerPx / 96) - 0.5, 0, 1);
    const scale = props.scale;
    const strokeStyle = props.strokeStyle;
    const logScale = props.logScale;

    console.log({ logScale });

    cancelAnimationFrame(animationFrame);

    animationFrame = requestAnimationFrame(async () => {
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

    const zoomedLength = duration() / props.zoom;
    const { width, height, left } = event.currentTarget.getBoundingClientRect();

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
      const pointerPositionPercentage = (event.clientX - left) / width;
      const pointerPosition = props.position + zoomedLength * pointerPositionPercentage;

      const newZoom = clamp(props.zoom * (1 + deltaY / height), 1, dataLength() / width);
      const newZoomedLength = duration() / newZoom;

      const maxPosition = duration() - duration() / newZoom;
      const newPosition = clamp(
        pointerPosition - pointerPositionPercentage * newZoomedLength,
        0,
        maxPosition,
      );

      props.onPositionChange?.(newPosition);
      props.onZoomChange?.(newZoom);
    }
  };

  const handleScroll = (event: UIEvent & { currentTarget: Element }) => {
    event.preventDefault();
    const { width } = scrollDivRef!.getBoundingClientRect();
    const { scrollLeft, clientWidth } = event.currentTarget;

    const scrollableWidth = width - clientWidth;
    const scrollAmount = scrollableWidth > 0 ? scrollLeft / scrollableWidth : 0;
    const maxPosition = duration() - duration() / props.zoom;

    props.onPositionChange?.(maxPosition * scrollAmount);
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (props.regions === undefined) return;

    event.preventDefault();
    const mouseDownPosition = getPosition(event.clientX);

    const onMouseMove = (event: MouseEvent) => {
      const mouseMovePosition = getPosition(event.clientX);

      const createdRegion = newRegion();
      if (!createdRegion) {
        const id = createUniqueId();
        const color = randomColor();

        const region = {
          id,
          color,
          start: Math.min(mouseDownPosition, mouseMovePosition),
          end: Math.max(mouseDownPosition, mouseMovePosition),
        };

        setNewRegion(region);
        props.onCreateRegion?.(region);
      } else {
        const region = {
          ...createdRegion,
          start: Math.min(mouseDownPosition, mouseMovePosition),
          end: Math.max(mouseDownPosition, mouseMovePosition),
        };

        props.onUpdateRegion?.(region);
      }
    };

    const onMouseUp = () => {
      setNewRegion(undefined);
      scrollDivRef?.removeEventListener("mousemove", onMouseMove);
      scrollDivRef?.removeEventListener("mouseup", onMouseUp);
    };

    scrollDivRef?.addEventListener("mousemove", onMouseMove);
    scrollDivRef?.addEventListener("mouseup", onMouseUp);
  };

  createEffect(() => {
    cachedWaveformPeaks().warmup((progress) => setProgress(progress));
  });

  createEffect(() => {
    const maxPosition = duration() - duration() / props.zoom;
    const scrollAmount = props.position / maxPosition;

    if (!scrollDivRef || !scrollDivRef.parentElement) return;

    const { clientWidth } = scrollDivRef.parentElement;

    scrollDivRef.parentElement.scrollLeft = scrollAmount * (clientWidth * props.zoom - clientWidth);

    scrollDivRef.style.width = `${clientWidth * props.zoom}px`;
  });

  return (
    <div
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

      <div
        style={{
          display: progress() === 0 || progress() === 1 ? "none" : "flex",
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

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          "overflow-x": "auto",
        }}
        onScroll={handleScroll}
      >
        <div
          ref={scrollDivRef}
          style={{ height: "100%", position: "relative" }}
          onMouseDown={handleMouseDown}
        >
          <Index each={props.regions}>
            {(region) => (
              <Region
                region={region()}
                duration={duration()}
                getPosition={getPosition}
                onUpdateRegion={props.onUpdateRegion}
                onClickRegion={props.onClickRegion}
                onDblClickRegion={props.onDblClickRegion}
              />
            )}
          </Index>
        </div>
      </div>
    </div>
  );
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};
