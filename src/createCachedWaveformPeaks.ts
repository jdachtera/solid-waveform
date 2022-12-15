type WaveformData = Float32Array | number[];
export type WaveformMode = "peak" | "rms";

const createCachedWaveformSource = (data: WaveformData) => {
  const cache: Record<WaveformMode, Map<number, Map<number, [number, number]>>> = {
    peak: new Map(),
    rms: new Map(),
  };

  const getValues = async ({
    samplesPerPx,
    onProgress,
    start = 0,
    end = Math.ceil(data.length / samplesPerPx),
    mode = "peak",
  }: {
    samplesPerPx: number;

    onProgress?: (progress: number) => void;
    start?: number;
    end?: number;
    mode: WaveformMode;
  }) => {
    const peaks = [];

    for (let x = start; x <= end; x++) {
      peaks.push(getValuesAtCached(samplesPerPx, x, mode));
      if (x % 10000 === 0 && onProgress) {
        onProgress?.(x / end);
        await new Promise(requestAnimationFrame);
      }
    }

    return peaks;
  };

  const getValuesAtCached = (samplesPerPx: number, x: number, mode: WaveformMode) => {
    if (samplesPerPx === 1) {
      return [data[x], data[x]];
    }
    const peaksArray = getOrCreatePeaksCache(samplesPerPx, mode);

    if (!peaksArray.has(x)) {
      const multiplicator = 2;
      const roughSamples = Math.ceil(samplesPerPx / multiplicator / 100) * 100;

      if (roughSamples > 100) {
        let min = 0;
        let max = 0;

        const start = Math.round((x * samplesPerPx) / roughSamples);
        for (let i = 0; i < multiplicator; i++) {
          const value = getValuesAtCached(roughSamples, start + i, mode);
          if (value[1] > max) {
            max = value[1];
          }
          if (value[0] < min) {
            min = value[0];
          }
        }

        peaksArray.set(x, [min, max]);
      } else {
        peaksArray.set(x, getPeakAt(data, samplesPerPx, x, mode));
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return peaksArray.get(x)!;
  };

  const warmup = async (mode: WaveformMode, onProgress: (progress: number) => void) => {
    onProgress(1);

    const cachedSteps = Array.from({
      length: Math.ceil(data.length / 20000000),
    }).map((_, index) => {
      return (index + 2) * 100;
    });

    await cachedSteps.reduce(async (prev, samplesPerPx, i) => {
      await prev;
      await getValues({
        samplesPerPx,
        onProgress: (progress) => {
          onProgress((i + progress) / cachedSteps.length);
        },
        mode,
      });
    }, Promise.resolve());

    onProgress(1);
  };

  const getOrCreatePeaksCache = (samplesPerPx: number, mode: WaveformMode) => {
    if (!cache[mode].has(samplesPerPx)) {
      cache[mode].set(samplesPerPx, new Map());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache[mode].get(samplesPerPx)!;
  };

  return {
    warmup,
    getValues,
  };
};

export const getPeakAt = (
  data: WaveformData,
  samplesPerPx: number,
  x: number,
  mode: WaveformMode,
): [number, number] => {
  let max = 0;
  let min = 0;

  if (samplesPerPx <= 1) {
    if (mode === "peak") {
      const indexCeil = Math.ceil(x * samplesPerPx);
      const indexFloor = Math.floor(x * samplesPerPx);

      const ratio = x % 1;
      const valueCeil = data[indexCeil];
      const valueFloor = data[indexFloor];

      const value = valueCeil * ratio + valueFloor * (1 - ratio);

      return [value < 0 ? value : 0, value > 0 ? value : 0];
    } else {
      const index = Math.round(x * samplesPerPx);
      const value = data[index];
      return [value < 0 ? value : 0, value > 0 ? value : 0];
    }
  }

  for (let i = 0; i < samplesPerPx; i++) {
    const index = Math.floor(x * samplesPerPx) + i;

    if (index >= data.length) break;

    const value = data[index];

    if (mode === "peak") {
      if (value > max) {
        max = value;
      } else if (value < min) {
        min = value;
      }
    } else {
      if (value > max) {
        max += Math.pow(value, 2) / samplesPerPx;
      } else if (value < min) {
        min += Math.pow(value, 2) / samplesPerPx;
      }
    }
  }

  if (mode === "peak") {
    return [min, max];
  } else {
    return [-Math.sqrt(min), Math.sqrt(max)];
  }
};

export default createCachedWaveformSource;
