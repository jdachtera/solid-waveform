import { createSignal, createUniqueId, Index } from "solid-js";
import { useWaveformContext } from "./context";
import { randomColor } from "./helpers";
import { Region } from "./Region";

const Regions = (props: {
  regions?: Region[];
  onCreateRegion?: (region: Region) => void;
  onUpdateRegion?: (region: Region) => void;
  onClickRegion?: (region: Region, event: MouseEvent) => void;
  onDblClickRegion?: (region: Region, event: MouseEvent) => void;
}) => {
  let containerRef: HTMLDivElement | undefined;

  const [newRegion, setNewRegion] = createSignal<Region>();
  const context = useWaveformContext();

  const getPosition = (clientX: number) => {
    const parent = containerRef?.parentElement;
    if (!parent) return 0;

    const width = containerRef?.clientWidth ?? 0;
    const rect = parent?.getBoundingClientRect();

    const position = ((clientX - rect.left + parent.scrollLeft) / width) * context.duration;

    return position;
  };

  const handleMouseDown = (event: MouseEvent) => {
    if (props.regions === undefined) return;

    event.stopPropagation();
    event.preventDefault();
    const mouseDownPosition = getPosition(event.clientX);

    const onMouseMove = (event: MouseEvent) => {
      const mouseMovePosition = getPosition(event.clientX);

      const createdRegion = newRegion();
      if (!createdRegion) {
        const id = createUniqueId();
        const color = randomColor();

        const region = {
          id,
          color,
          start: Math.min(mouseDownPosition, mouseMovePosition),
          end: Math.max(mouseDownPosition, mouseMovePosition),
        };

        setNewRegion(region);
        props.onCreateRegion?.(region);
      } else {
        const region = {
          ...createdRegion,
          start: Math.min(mouseDownPosition, mouseMovePosition),
          end: Math.max(mouseDownPosition, mouseMovePosition),
        };

        props.onUpdateRegion?.(region);
      }
    };

    const onMouseUp = () => {
      setNewRegion(undefined);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      class="Waveform-Regions"
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}
      ref={containerRef}
      onMouseDown={handleMouseDown}
    >
      <Index each={props.regions}>
        {(region) => (
          <Region
            region={region()}
            duration={context.duration}
            getPosition={getPosition}
            onUpdateRegion={props.onUpdateRegion}
            onClickRegion={props.onClickRegion}
            onDblClickRegion={props.onDblClickRegion}
          />
        )}
      </Index>
    </div>
  );
};

export default Regions;
