import createCachedWaveformSource from "./createCachedWaveformPeaks";
import { Region } from "./Region";
import Waveform from "./Waveform";
import Oscilloscope from "./Oscilloscope";
import Regions from "./Regions";
import PlayHead from "./PlayHead";

export type { WaveformData, WaveformMode } from "./createCachedWaveformPeaks";

export {
  Waveform,
  Oscilloscope,
  Regions,
  Region,
  PlayHead,
  createCachedWaveformSource as createCachedWaveformPeaks,
};
