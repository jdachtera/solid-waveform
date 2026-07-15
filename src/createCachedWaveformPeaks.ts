export type WaveformData = Float32Array | number[];
export type WaveformMode = "peak" | "rms";

const createCachedWaveformSource = (
  data: WaveformData,
): {
  warmup: (mode: WaveformMode, onProgress: (progress: number) => void) => Promise<void>;
  getValues: (args: {
    samplesPerPx: number;
    onProgress?: (progress: number) => void;
    start?: number;
    end?: number;
    mode: WaveformMode;
    store?: boolean;
  }) => Promise<number[][]>;
} => {
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
    store = true,
  }: {
    samplesPerPx: number;

    onProgress?: (progress: number) => void;
    start?: number;
    end?: number;
    mode: WaveformMode;
    // Memoize each queried column under this exact samplesPerPx? A live resize
    // sweeps samplesPerPx continuously (width changes every frame), so storing
    // would allocate a fresh per-width Map every frame AND retain them forever
    // (a leak + GC churn — the resize gets choppier over time). The render path
    // passes store:false: columns are derived transiently from the ROUNDED rough
    // levels (which ARE memoized + shared across frames), so a resize is cheap and
    // allocation-free. Warmup / fixed-zoom callers keep store:true.
    store?: boolean;
  }) => {
    const peaks: number[][] = [];

    // A non-finite or non-positive samplesPerPx (e.g. width 0 -> Infinity) makes
    // the default `end` Infinity/0 and recurses getValuesAtCached forever; bail.
    if (!Number.isFinite(samplesPerPx) || samplesPerPx <= 0 || !Number.isFinite(end)) {
      return peaks;
    }

    for (let x = start; x <= end; x++) {
      peaks.push(getValuesAtCached(samplesPerPx, x, mode, store));
      if (x % 10000 === 0 && onProgress) {
        onProgress?.(x / end);
        await new Promise(requestAnimationFrame);
      }
    }

    return peaks;
  };

  const getValuesAtCached = (
    samplesPerPx: number,
    x: number,
    mode: WaveformMode,
    store = true,
  ): [number, number] => {
    // Defensive: a non-finite samplesPerPx would recurse forever below.
    if (!Number.isFinite(samplesPerPx)) {
      return [0, 0];
    }
    if (samplesPerPx === 1) {
      return [data[x], data[x]];
    }

    // Only consult/populate the per-samplesPerPx cache when memoizing (store).
    const peaksArray = store ? getOrCreatePeaksCache(samplesPerPx, mode) : undefined;
    const cached = peaksArray?.get(x);
    if (cached) return cached;

    const multiplicator = 2;
    const roughSamples = Math.ceil(samplesPerPx / multiplicator / 100) * 100;

    let result: [number, number];
    if (roughSamples > 100) {
      let min = 0;
      let max = 0;

      const start = Math.round((x * samplesPerPx) / roughSamples);
      for (let i = 0; i < multiplicator; i++) {
        // The rough level (rounded to 100) IS memoized + shared across every frame
        // and samplesPerPx — that's what makes the transient top-level cheap.
        const value = getValuesAtCached(roughSamples, start + i, mode, true);
        if (value[1] > max) {
          max = value[1];
        }
        if (value[0] < min) {
          min = value[0];
        }
      }

      result = [min, max];
    } else {
      result = getPeakAt(data, samplesPerPx, x, mode);
    }

    peaksArray?.set(x, result);
    return result;
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
