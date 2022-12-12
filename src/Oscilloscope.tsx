import { createMemo, JSX, mergeProps, splitProps } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import { getPeakAt } from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";
import { clamp } from "./helpers";

const Oscilloscope = (
  allProps: {
    analyzerNode: AnalyserNode;
    scale?: number;
    slowNessFactor?: number;
  } & JSX.IntrinsicElements["div"],
) => {
  const propsWithDefaults = mergeProps(allProps, { slowNessFactor: 250, scale: 1 });
  const [props, divProps] = splitProps(propsWithDefaults, [
    "analyzerNode",
    "slowNessFactor",
    "scale",
  ]);
  let animationFrame: number;
  let canvasRef: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;
  let dimensions: DOMRect | undefined;

  const dataArray = createMemo(() => new Float32Array(props.analyzerNode.frequencyBinCount));

  let lastDraw = 0;
  let peaks: [number, number][] = [];
  const draw = () => {
    animationFrame = requestAnimationFrame(draw);

    const now = Date.now();
    const timePassedSinceLastRender = now - lastDraw;

    if (!dimensions?.width || !context) return;

    lastDraw = now;

    const percentage =
      props.slowNessFactor > 0 ? timePassedSinceLastRender / props.slowNessFactor : 1;

    const data = dataArray();

    const { width, height } = dimensions;

    const dpi = window.devicePixelRatio;

    canvasRef?.setAttribute("width", (width * dpi).toString());
    canvasRef?.setAttribute("height", (height * dpi).toString());

    context.scale(dpi, dpi);

    props.analyzerNode.getFloatTimeDomainData(data);

    const samplesPerPx = data.length / dimensions.width;
    const previousPeaks = peaks;
    peaks = [];

    for (let x = 0; x < dimensions.width; x++) {
      const peak = getPeakAt(data, samplesPerPx, x);

      peaks.push([
        peak[0] * percentage + (previousPeaks?.[x]?.[0] ?? 0) * (1 - percentage),
        peak[1] * percentage + (previousPeaks?.[x]?.[1] ?? 0) * (1 - percentage),
      ]);
    }

    drawWaveformWithPeaks({
      context,
      peaks,

      peaksOpacity: clamp(Math.log(samplesPerPx / 35) - 0.5, 0, 1),
      logScale: true,
      scale: props.scale,

      width,
      height,
    });
  };

  const updateDimensions = () => {
    dimensions = canvasRef?.getBoundingClientRect();
  };

  onMount(() => {
    context = canvasRef?.getContext("2d") ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.observe(canvasRef!);
    updateDimensions();
    draw();
  });

  onCleanup(() => {
    cancelAnimationFrame(animationFrame);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.unobserve(canvasRef!);
  });

  const observer = new ResizeObserver(() => {});

  return (
    <div
      {...divProps}
      style={{
        ...(typeof divProps.style === "object" && divProps.style),
        position: "relative",
      }}
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
      ></canvas>
    </div>
  );
};

export default Oscilloscope;
