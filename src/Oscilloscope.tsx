import { createMemo, JSX, splitProps } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import { getPeakAt } from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";
import { clamp } from "./helpers";

const Oscilloscope = (allProps: { analyzerNode: AnalyserNode } & JSX.IntrinsicElements["div"]) => {
  const [props, divProps] = splitProps(allProps, ["analyzerNode"]);
  let animationFrame: number;
  let canvasRef: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | undefined;
  let dimensions: DOMRect | undefined;

  const dataArray = createMemo(() => new Uint8Array(props.analyzerNode.frequencyBinCount));

  let lastDraw = 0;
  const draw = () => {
    animationFrame = requestAnimationFrame(draw);

    const now = Date.now();

    if (now - lastDraw < 30) return;
    if (!dimensions?.width || !context) return;

    lastDraw = now;

    const data = dataArray();

    const { width, height } = dimensions;

    const dpi = window.devicePixelRatio;

    canvasRef?.setAttribute("width", (width * dpi).toString());
    canvasRef?.setAttribute("height", (height * dpi).toString());

    context.scale(dpi, dpi);

    const samplesPerPx = Math.floor(data.length / dimensions.width);

    props.analyzerNode.getByteTimeDomainData(data);

    const peaks = [];

    const normalizedData = [...data.values()].map((y) => (y - 128) / 128);

    for (let x = 0; x < dimensions.width; x++) {
      peaks.push(getPeakAt(normalizedData, samplesPerPx, x));
    }

    drawWaveformWithPeaks({
      context,
      peaks,

      peaksOpacity: clamp(Math.log(samplesPerPx / 35) - 0.5, 0, 1),

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
