import { createEffect, createMemo, JSX, mergeProps, splitProps } from "solid-js";
import { useWaveformContext } from "./context";
import { clamp } from "./helpers";

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
  const { duration, updatePosition, zoom, dimensions } = useWaveformContext();

  createEffect(() => {
    if (!props.sync) return;

    const maxPosition = duration() - duration() / zoom();
    const newPosition = clamp(props.playHeadPosition - duration() / zoom() / 2, 0, maxPosition);

    updatePosition(newPosition);
  });

  const range = createMemo(() => dimensions().width - 2);
  const leftPosition = createMemo(() => (props.playHeadPosition / duration()) * range());

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

          const percentage = (leftPosition() + movementX) / range()!;

          props.onPlayHeadPositionChange?.(percentage * duration());
        };
        const handleMouseUp = (event: MouseEvent) => {
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
