import { createMemo, Index, Show, splitProps, JSX } from "solid-js";
import useWaveformViewPortScaler from "./useWaveformViewportScaler";

/** A warp/cue marker: a play-start point inside a looping region, addressable by a
 *  MIDI key. `position` is in the waveform's time units (seconds); `label` is the
 *  key name shown above the tick. */
export type Marker = { id: string; position: number; color?: string; label?: string };

/** A single draggable marker tick (a thin vertical line + optional key label). The
 *  tick captures its own drag (cue-move) and double-click (delete); the surrounding
 *  Markers container owns the option/alt-click "add" gesture. */
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

/** Overlay of marker ticks over the waveform. Option/Alt-click on empty space adds a
 *  marker at the click position (`onAddMarker`); ticks drag to move their cue and
 *  double-click to delete. A plain click passes through (the tick handles its own). */
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

  return (
    <div
      class="Waveform-Markers"
      {...divProps}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        // The container itself only reacts to the alt-click add; ticks re-enable
        // pointer events. Plain space is inert so it doesn't fight the waveform.
        "pointer-events": "auto",
        ...(typeof divProps.style === "object" && divProps.style),
      }}
      onMouseDown={(event) => {
        if (!event.altKey) return; // only Option/Alt-click adds a marker
        event.preventDefault();
        event.stopPropagation();
        props.onAddMarker?.(viewPort.getPosition(event.clientX));
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
