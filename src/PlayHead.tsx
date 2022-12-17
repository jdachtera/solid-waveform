import { createEffect, createMemo, JSX, mergeProps, splitProps, untrack } from "solid-js";
import { useWaveformContext } from "./context";
import { clamp } from "./helpers";
import useScaler from "./useScaler";

const PlayHead = (
  allProps: {
    playHeadPosition?: number;
    sync?: boolean;
    onPlayHeadPositionChange?: (playHeadPosition: number) => void;
  } & JSX.IntrinsicElements["div"],
) => {
  const propsWithDefauls = mergeProps({ playHeadPosition: 0, sync: false }, allProps);
  const [props, divProps] = splitProps(propsWithDefauls, [
    "playHeadPosition",
    "sync",
    "onPlayHeadPositionChange",
  ]);
  const context = useWaveformContext();
  const scaler = useScaler();

  createEffect(() => {
    if (!props.sync) return;

    const maxPosition = context.duration - context.duration / context.zoom;
    const newPosition = clamp(
      props.playHeadPosition - context.duration / context.zoom / 2,
      0,
      maxPosition,
    );

    context.updatePosition?.(newPosition);
  });

  const leftPosition = createMemo(() => scaler.getCoordinates(props.playHeadPosition));

  return (
    <div
      class="PlayHead"
      {...divProps}
      style={{
        position: "absolute",
        height: "100%",
        width: "2px",
        left: `${leftPosition()}px`,
        "background-color": "green",
        cursor: "pointer",
        ...(typeof divProps.style === "object" && divProps.style),
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const handleMouseMove = ({ movementX }: MouseEvent) => {
          const { parentElement } = event.currentTarget;
          if (!parentElement) return;

          const newPosition = scaler.getPosition(leftPosition() + movementX);
          props.onPlayHeadPositionChange?.(newPosition);
        };
        const handleMouseUp = () => {
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);
        };
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      }}
    />
  );
};

export default PlayHead;
