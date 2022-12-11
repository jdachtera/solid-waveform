type WaveformData = Float32Array | number[];

const createCachedWaveformPeaks = (data: WaveformData) => {
  const cache: Map<number, Map<number, [number, number]>> = new Map();

  const getPeaks = async ({
    samplesPerPx,
    onProgress,
    start = 0,
    end = Math.ceil(data.length / samplesPerPx),
  }: {
    samplesPerPx: number;

    onProgress?: (progress: number) => void;
    start?: number;
    end?: number;
  }) => {
    const peaks = [];

    for (let x = start; x < end; x++) {
      peaks.push(getPeakAtCached(samplesPerPx, x));
      if (x % 10000 === 0 && onProgress) {
        onProgress?.(x / end);
        await new Promise(requestAnimationFrame);
      }
    }

    return peaks;
  };

  const getPeakAtCached = (samplesPerPx: number, x: number) => {
    if (samplesPerPx === 1) {
      return [data[x], data[x]];
    }
    const peaksArray = getOrCreatePeaksCache(samplesPerPx);

    if (!peaksArray.has(x)) {
      const multiplicator = 2;
      const roughSamples = Math.ceil(samplesPerPx / multiplicator / 100) * 100;

      if (roughSamples > 100) {
        let min = 0;
        let max = 0;

        const start = Math.round((x * samplesPerPx) / roughSamples);
        for (let i = 0; i < multiplicator; i++) {
          const value = getPeakAtCached(roughSamples, start + i);
          if (value[1] > max) {
            max = value[1];
          }
          if (value[0] < min) {
            min = value[0];
          }
        }

        peaksArray.set(x, [min, max]);
      } else {
        peaksArray.set(x, getPeakAt(data, samplesPerPx, x));
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return peaksArray.get(x)!;
  };

  const warmup = async (onProgress: (progress: number) => void) => {
    onProgress(1);

    const cachedSteps = Array.from({
      length: Math.ceil(data.length / 20000000),
    }).map((_, index) => {
      return (index + 2) * 100;
    });

    await cachedSteps.reduce(async (prev, samplesPerPx, i) => {
      await prev;
      await getPeaks({
        samplesPerPx,
        onProgress: (progress) => {
          onProgress((i + progress) / cachedSteps.length);
        },
      });
    }, Promise.resolve());

    onProgress(1);
  };

  const getOrCreatePeaksCache = (samplesPerPx: number) => {
    if (!cache.has(samplesPerPx)) {
      cache.set(samplesPerPx, new Map());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache.get(samplesPerPx)!;
  };

  return {
    warmup,
    getPeaks,
  };
};

export const getPeakAt = (
  data: WaveformData,
  samplesPerPx: number,
  x: number,
): [number, number] => {
  let max = 0;
  let min = 0;

  for (let i = 0; i < samplesPerPx; i++) {
    const index = Math.floor(x * samplesPerPx) + i;

    if (index >= data.length) break;

    const value = data[index];

    if (value > max) {
      max = value;
    } else if (value < min) {
      min = value;
    }
  }

  return [min, max];
};

export default createCachedWaveformPeaks;
