import createCachedWaveformSource from "./createCachedWaveformPeaks";
import { Region } from "./Region";
import Waveform, { type WaveformSource, type WaveformProps } from "./Waveform";
import Oscilloscope from "./Oscilloscope";
import Regions from "./Regions";
import PlayHead from "./PlayHead";
import Markers, { MarkerTick, type Marker } from "./Markers";
import PeaksOverlay from "./PeaksOverlay";

export type { WaveformData, WaveformMode } from "./createCachedWaveformPeaks";
export type { WaveformSource, WaveformProps, Marker };

export {
  Waveform,
  Oscilloscope,
  Regions,
  Region,
  PlayHead,
  Markers,
  MarkerTick,
  PeaksOverlay,
  createCachedWaveformSource as createCachedWaveformPeaks,
};
