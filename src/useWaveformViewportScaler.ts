import { createViewPortAxis } from "solid-viewport";
import { useWaveformContext } from "./context";

// The waveform's time axis, backed by solid-viewport. The method names below are
// kept as an adapter over the generic axis so the rest of the library (Region,
// PlayHead) is untouched — the underlying math is identical:
//   getScaledValue       = toPixels          (time -> px, absolute)
//   getCoordinates       = toPixelOffset     (time -> px, relative to scroll position)
//   getPosition          = toPosition        (px -> time)
//   getVirtualDimensions = clampedDimensions (region {offset,size}, clipped to view)
const useWaveformViewPortScaler = () => {
  const context = useWaveformContext();
  const axis = createViewPortAxis(() => ({
    name: "time",
    position: context.position,
    range: context.duration,
    pixelOffset: context.dimensions.left,
    pixelSize: context.dimensions.width,
    zoom: context.zoom,
  }));

  return {
    getScaledValue: (position?: number) => axis.toPixels(position),
    getCoordinates: (position: number) => axis.toPixelOffset(position),
    getPosition: (offset: number) => axis.toPosition(offset),
    getVirtualDimensions: (position: number, length: number) =>
      axis.clampedDimensions(position, length),
  };
};

export default useWaveformViewPortScaler;
