import { useWaveformContext } from "./context";
import useViewPortScaler from "./useViewPortScaler";

const useWaveformViewPortScaler = () => {
  const context = useWaveformContext();
  const viewPort = useViewPortScaler(() => ({
    virtualPosition: context.position,
    virtualRange: context.duration,

    viewPortOffset: context.dimensions.left,
    viewPortSize: context.dimensions.width,

    zoom: context.zoom,
  }));

  return viewPort;
};

export default useWaveformViewPortScaler;
