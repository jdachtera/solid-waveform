import { createContext, useContext } from "solid-js";
const waveformContext = createContext({
    zoom: 0,
    duration: 0,
    position: 0,
    updatePosition: () => { },
    dimensions: { width: 0, height: 0, left: 0, top: 0 },
}, { name: "Waveform" });
export const WaveformContextProvider = waveformContext.Provider;
export const useWaveformContext = () => useContext(waveformContext);
