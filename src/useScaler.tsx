import { useWaveformContext } from "./context";
import { clamp } from "./helpers";

export default function useScaler() {
  const context = useWaveformContext();

  function getScaledValue(position: number) {
    const virtualWidth = context.dimensions.width * context.zoom;
    return (position / context.duration) * virtualWidth;
  }

  function getCoordinates(position: number) {
    return getScaledValue(position) - getScaledValue(context.position);
  }

  function getPosition(clientX: number) {
    const visibleDuration = context.duration / context.zoom;
    const percentX = (clientX - context.dimensions.left) / context.dimensions.width;
    const position = context.position + percentX * visibleDuration;

    return position;
  }

  function getVirtualDimensions(position: number, duration: number) {
    const virtualLeft = getCoordinates(position);
    const virtualWidth = getScaledValue(duration);

    const left = clamp(virtualLeft, 0, context.dimensions.width);
    const width = clamp(virtualWidth - (left - virtualLeft), 0, context.dimensions.width - left);

    return { left, width };
  }

  return {
    getScaledValue,
    getCoordinates,
    getPosition,
    getVirtualDimensions,
  };
}
