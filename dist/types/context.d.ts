export type WaveformContext = {
    duration: number;
    position: number;
    zoom: number;
    updatePosition?: (position: number) => void;
    dimensions: Pick<DOMRect, "width" | "height" | "left" | "top">;
};
export declare const WaveformContextProvider: import("solid-js").ContextProviderComponent<WaveformContext>;
export declare const useWaveformContext: () => WaveformContext;
