import { Accessor, createContext, useContext } from "solid-js";

export type WaveformContext = {
  duration: number;
  position: number;
  zoom: number;
  updatePosition?: (position: number) => void;
  dimensions: Pick<DOMRect, "width" | "height">;
};

const waveformContext = createContext<WaveformContext>(
  {
    zoom: 0,
    duration: 0,
    position: 0,
    updatePosition: () => {},
    dimensions: { width: 0, height: 0 },
  },
  { name: "Waveform" },
);

export const WaveformContextProvider = waveformContext.Provider;
export const useWaveformContext = () => useContext(waveformContext);
