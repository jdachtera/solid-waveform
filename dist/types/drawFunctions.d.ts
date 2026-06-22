type PeaksEntry = [x: number, absMinMax: number, minY: number, maxY: number];
export declare function drawSampleDots(ctx: CanvasRenderingContext2D, peaks: [number, number, number, number][], radius: number): void;
export declare function drawPeaks(ctx: CanvasRenderingContext2D, peaks: PeaksEntry[]): void;
export declare function drawWaveform(ctx: CanvasRenderingContext2D, peaks: PeaksEntry[]): void;
export declare const drawWaveformWithPeaks: ({ peaks, waveformStyle, peaksStyle, sampleDotsStyle, width, height, context, scale, logScale, }: {
    peaks: number[][];
    waveformStyle?: {
        opacity?: number;
        strokeStyle?: string | CanvasGradient | CanvasPattern;
        lineWidth?: number;
    };
    peaksStyle?: {
        opacity?: number;
        strokeStyle?: string | CanvasGradient | CanvasPattern;
        lineWidth?: number;
    };
    sampleDotsStyle?: {
        opacity?: number;
        fillStyle?: string | CanvasGradient | CanvasPattern;
        radius?: number;
    };
    width: number;
    height: number;
    context: CanvasRenderingContext2D;
    scale?: number;
    logScale?: boolean;
}) => Promise<void>;
export {};
