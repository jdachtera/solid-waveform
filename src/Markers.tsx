import { createMemo, Index, Show, splitProps, onMount, onCleanup, JSX } from "solid-js";
import useWaveformViewPortScaler from "./useWaveformViewportScaler";

/** A warp/cue marker: a play-start point inside a looping region, addressable by a
 *  MIDI key. `position` is in the waveform's time units (seconds); `label` is the
 *  key name shown above the tick. */
export type Marker = { id: string; position: number; color?: string; label?: string };

/** A single draggable marker tick (a thin vertical line + optional key label). The
 *  tick captures its own drag (cue-move) and double-click (delete). It sits above
 *  the (pointer-events-transparent) Markers overlay on its own z-index, so it stays
 *  grabbable even when another full-area layer (e.g. Regions) is stacked alongside. */
export const MarkerTick = (props: {
  marker: Marker;
  onUpdate?: (position: number) => void;
  onRemove?: (event: MouseEvent) => void;
  onClick?: (event: MouseEvent) => void;
}) => {
  const viewPort = useWaveformViewPortScaler();
  const left = createMemo(() => viewPort.getCoordinates(props.marker.position));

  return (
    <div
      class="Waveform-Marker"
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        width: "2px",
        left: `${left()}px`,
        "background-color": props.marker.color ?? "orange",
        cursor: "col-resize",
        "pointer-events": "auto",
        "z-index": 6,
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const onMove = (e: MouseEvent) => props.onUpdate?.(viewPort.getPosition(e.clientX));
        const onUp = (e: MouseEvent) => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          props.onClick?.(e);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      onDblClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onRemove?.(event);
      }}
    >
      <Show when={props.marker.label}>
        <span
          style={{
            position: "absolute",
            top: "0",
            left: "3px",
            "font-size": "9px",
            "font-family": "monospace",
            color: props.marker.color ?? "orange",
            "white-space": "nowrap",
            "pointer-events": "none",
          }}
        >
          {props.marker.label}
        </span>
      </Show>
    </div>
  );
};

/** Overlay of marker ticks over the waveform, designed to COMPOSE with any other
 *  full-area layer (drop it in next to `<Regions>` — order doesn't matter). Ticks
 *  drag to move their cue and double-click to delete; Option/Alt-click on empty
 *  space adds a marker (`onAddMarker`).
 *
 *  The overlay itself is `pointer-events: none`, so a plain drag falls straight
 *  THROUGH to the layer beneath (e.g. a region-create drag) instead of being
 *  swallowed — only the thin ticks re-enable pointer events. The one gesture the
 *  overlay claims, the Option/Alt-click "add", is caught in the CAPTURE phase on
 *  window (before any sibling layer's own mousedown handler runs) and only within
 *  this overlay's own bounds, then `stopPropagation`'d so the layer beneath never
 *  starts a competing gesture. */
export const Markers = (
  allProps: {
    markers?: Marker[];
    onAddMarker?: (position: number) => void;
    onUpdateMarker?: (index: number, position: number) => void;
    onRemoveMarker?: (index: number) => void;
    onClickMarker?: (index: number, event: MouseEvent) => void;
  } & JSX.IntrinsicElements["div"],
) => {
  const viewPort = useWaveformViewPortScaler();
  // Do NOT destructure props (Solid props are reactive getters); splitProps keeps
  // `markers` reactive so the tick list updates when a marker is added/moved/removed.
  const [props, divProps] = splitProps(allProps, [
    "markers",
    "onAddMarker",
    "onUpdateMarker",
    "onRemoveMarker",
    "onClickMarker",
  ]);

  // Claim the Option/Alt-click "add" in the capture phase, bounded to this overlay,
  // so it wins over a sibling layer's handler without the overlay having to sit on
  // top and block everything else. Left button only; every other event is ignored
  // and left to propagate to whatever is underneath.
  let containerEl: HTMLDivElement | undefined;
  const onCaptureDown = (event: MouseEvent) => {
    if (event.button !== 0 || !event.altKey || !props.onAddMarker || !containerEl) return;
    const r = containerEl.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      return; // outside this waveform — leave it for anyone else on the page
    event.preventDefault();
    event.stopPropagation();
    props.onAddMarker(viewPort.getPosition(event.clientX));
  };
  onMount(() => window.addEventListener("mousedown", onCaptureDown, true));
  onCleanup(() => window.removeEventListener("mousedown", onCaptureDown, true));

  return (
    <div
      ref={containerEl}
      class="Waveform-Markers"
      {...divProps}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        // Transparent to pointers: plain drags pass through to the layer beneath;
        // only the ticks re-enable events. The add gesture is handled in capture
        // (see onCaptureDown) so it needs no full-area event sink here.
        "pointer-events": "none",
        ...(typeof divProps.style === "object" && divProps.style),
      }}
    >
      <Index each={props.markers}>
        {(marker, index) => (
          <MarkerTick
            marker={marker()}
            onUpdate={(pos) => props.onUpdateMarker?.(index, pos)}
            onRemove={() => props.onRemoveMarker?.(index)}
            onClick={(e) => props.onClickMarker?.(index, e)}
          />
        )}
      </Index>
    </div>
  );
};

export default Markers;
