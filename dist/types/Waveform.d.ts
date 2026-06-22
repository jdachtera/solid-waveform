import { JSX } from "solid-js";
import { WaveformMode } from "./createCachedWaveformPeaks";
declare const Waveform: (allProps: {
    buffer?: AudioBuffer;
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
} & JSX.HTMLAttributes<HTMLDivElement>) => JSX.Element;
export default Waveform;
