type WaveformData = Float32Array | number[];
export type WaveformMode = "peak" | "rms";
declare const createCachedWaveformSource: (data: WaveformData) => {
    warmup: (mode: WaveformMode, onProgress: (progress: number) => void) => Promise<void>;
    getValues: ({ samplesPerPx, onProgress, start, end, mode, }: {
        samplesPerPx: number;
        onProgress?: (progress: number) => void;
        start?: number;
        end?: number;
        mode: WaveformMode;
    }) => Promise<number[][]>;
};
export declare const getPeakAt: (data: WaveformData, samplesPerPx: number, x: number, mode: WaveformMode) => [number, number];
export default createCachedWaveformSource;
