type PeaksEntry = [x: number, absMinMax: number, minY: number, maxY: number];

export function drawPeaks(ctx: CanvasRenderingContext2D, peaks: PeaksEntry[]) {
  ctx.beginPath();

  peaks.forEach(([x1, _, minY, maxY]) => {
    ctx.moveTo(x1, minY);
    ctx.lineTo(x1, maxY);
  });
  ctx.closePath();
  ctx.stroke();
}

export function drawWaveform(ctx: CanvasRenderingContext2D, peaks: PeaksEntry[]) {
  ctx.beginPath();

  for (let i = 0; i < peaks.length - 1; i++) {
    const [x1, y1] = peaks[i];
    const [x2, y2] = peaks[i + 1];

    const x_mid = (x1 + x2) / 2;
    const y_mid = (y1 + y2) / 2;
    const cp_x1 = (x_mid + x1) / 2;
    const cp_x2 = (x_mid + x2) / 2;

    ctx.quadraticCurveTo(cp_x1, y1, x_mid, y_mid);
    ctx.quadraticCurveTo(cp_x2, y2, x2, y2);
  }
  ctx.stroke();
}

export const drawWaveformWithPeaks = async ({
  peaks,
  peaksOpacity,
  width,
  height,
  context,
  scale = 1,
  strokeStyle = "rgb(0,0,0)",
  logScale,
}: {
  peaks: number[][];
  peaksOpacity: number;
  width: number;
  height: number;
  context: CanvasRenderingContext2D;
  scale?: number;
  strokeStyle?: string | CanvasGradient | CanvasPattern;
  logScale: boolean;
}) => {
  const startY = height / 2;

  const scaledPeaks = peaks.map(([min, max], i, peaks): PeaksEntry => {
    const minValue = logScale ? -Math.log10(-min * 20) * 0.7 : min;
    const maxValue = logScale ? Math.log10(max * 20) * 0.7 : max;

    const x = (i / peaks.length) * width;

    const minY = startY + minValue * startY * scale;
    const maxY = startY + maxValue * startY * scale;

    const absMaxY = Math.abs(min) > Math.abs(max) ? minY : maxY;

    return [x, absMaxY, minY, maxY];
  });

  context.clearRect(0, 0, width, height);
  context.strokeStyle = strokeStyle;
  context.globalAlpha = 1;
  drawWaveform(context, scaledPeaks);

  context.globalAlpha = peaksOpacity;
  drawPeaks(context, scaledPeaks);
};
