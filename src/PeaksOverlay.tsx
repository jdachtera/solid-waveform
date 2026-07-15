import { createEffect, onCleanup, onMount, splitProps, JSX } from "solid-js";
import useWaveformViewPortScaler from "./useWaveformViewportScaler";
import createCachedWaveformSource, { WaveformData } from "./createCachedWaveformPeaks";
import { drawWaveformWithPeaks } from "./drawFunctions";

/** Draws a peaks envelope confined to a sub-region [start, end] of the waveform's time
 *  axis — an overlay layer for e.g. a time-warped / stretched rendering of ONE section
 *  on top of the raw waveform. `data` is the ALREADY-TRANSFORMED envelope and is drawn
 *  uniformly across the region, so the warp is baked into `data` and this component
 *  stays a dumb "draw these peaks over this span" primitive.
 *
 *  The region is positioned + sized through the shared viewport scaler (like Regions
 *  and Markers), so it tracks zoom/pan. It's `pointer-events: none` — purely visual. */
export const PeaksOverlay = (
  allProps: {
    data: WaveformData;
    /** Region bounds in the waveform's time units (seconds). */
    start: number;
    end: number;
    /** Envelope stroke colour (default orange). */
    color?: string;
    /** Optional background tint behind the region (e.g. to dim the raw wave under it). */
    fill?: string;
    /** Envelope opacity (default 1). */
    opacity?: number;
    /** Vertical amplitude scale (matches Waveform's `scale`, default 1). */
    scale?: number;
    lineWidth?: number;
  } & Omit<JSX.IntrinsicElements["div"], "style">,
): JSX.Element => {
  const viewPort = useWaveformViewPortScaler();
  const [props, divProps] = splitProps(allProps, [
    "data",
    "start",
    "end",
    "color",
    "fill",
    "opacity",
    "scale",
    "lineWidth",
  ]);

  let wrapRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;

  const left = () => viewPort.getCoordinates(props.start);
  const right = () => viewPort.getCoordinates(props.end);
  const width = () => Math.max(0, right() - left());

  const redraw = async () => {
    const wrap = wrapRef;
    const canvas = canvasRef;
    if (!wrap || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(width() * dpr));
    const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const arr = props.data;
    if (!arr || arr.length === 0 || width() <= 0) return;

    // One min/max column per device pixel, drawn uniformly across the region — the
    // envelope IS the warped result, so no per-pixel time mapping is needed here.
    const src = createCachedWaveformSource(arr);
    const samplesPerPx = arr.length / w;
    if (!Number.isFinite(samplesPerPx) || samplesPerPx <= 0) return;
    const peaks = await src.getValues({
      samplesPerPx,
      start: 0,
      end: w,
      mode: "peak",
      store: false,
    });
    if (canvasRef !== canvas) return; // remounted mid-await

    const lw = (props.lineWidth ?? 1) * dpr;
    drawWaveformWithPeaks({
      peaks,
      width: w,
      height: h,
      context: ctx,
      scale: props.scale ?? 1,
      waveformStyle: {
        strokeStyle: props.color ?? "orange",
        opacity: props.opacity ?? 1,
        lineWidth: lw,
      },
      peaksStyle: { opacity: 0 },
      sampleDotsStyle: { opacity: 0 },
    });
  };

  // Redraw whenever the data, the region, or the viewport (pan/zoom) changes.
  createEffect(() => {
    props.data;
    props.start;
    props.end;
    props.scale;
    props.color;
    props.opacity;
    width();
    void redraw();
  });

  onMount(() => {
    const ro = new ResizeObserver(() => void redraw());
    if (wrapRef) ro.observe(wrapRef);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div
      ref={wrapRef}
      class="Waveform-PeaksOverlay"
      {...divProps}
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        left: `${left()}px`,
        width: `${width()}px`,
        "pointer-events": "none",
        "background-color": props.fill ?? "transparent",
        overflow: "hidden",
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
};

export default PeaksOverlay;
