import { JSX } from "solid-js";
import { WaveformMode } from "./createCachedWaveformPeaks";
declare const Oscilloscope: (allProps: {
    analyzerNode: AnalyserNode;
    scale?: number;
    strokeStyle?: string | CanvasGradient | CanvasPattern;
    lineWidth?: number;
    slowNessFactor?: number;
    mode?: WaveformMode;
} & JSX.IntrinsicElements["div"]) => JSX.Element;
export default Oscilloscope;
