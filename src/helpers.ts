export const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

export function randomColor() {
  const randR = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const randG = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const randB = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const color = `rgba(${randR},${randG},${randB},0.8)`;
  return color;
}
