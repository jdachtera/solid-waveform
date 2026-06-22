import { createEffect, onCleanup, For, createMemo, Show } from "solid-js";
import { createStore } from "solid-js/store";
import useWaveformViewPortScaler from "./useWaveformViewportScaler";
const regionDragHandles = ["LEFT", "MIDDLE", "RIGHT"];
export const Region = (props) => {
    const viewPort = useWaveformViewPortScaler();
    const virtualDimensions = createMemo(() => viewPort.getVirtualDimensions(props.region.start, props.region.end - props.region.start));
    const [state, setState] = createStore({ dragHandle: "LEFT", offset: 0 });
    const handleMouseMove = (event) => {
        event.preventDefault();
        const position = viewPort.getPosition(event.clientX);
        if (!state.initialRegion)
            return;
        switch (state.dragHandle) {
            case "LEFT":
                props.onUpdateRegion?.({
                    id: props.region.id,
                    color: props.region.color,
                    start: Math.min(position, state.initialRegion.end),
                    end: Math.max(position, state.initialRegion.end),
                });
                break;
            case "RIGHT":
                props.onUpdateRegion?.({
                    id: props.region.id,
                    color: props.region.color,
                    start: Math.min(position, state.initialRegion.start),
                    end: Math.max(position, state.initialRegion.start),
                });
                break;
            case "MIDDLE":
                props.onUpdateRegion?.({
                    id: props.region.id,
                    color: props.region.color,
                    start: position - state.offset,
                    end: position - state.offset + (state.initialRegion.end - state.initialRegion.start),
                });
        }
    };
    const handleMouseUp = (event) => {
        setState({ initialRegion: undefined });
        onClickRegion(event);
    };
    const onDragHandleMouseDown = (event, dragHandle) => {
        event.stopPropagation();
        setState({
            dragHandle,
            initialRegion: props.region,
            offset: dragHandle === "MIDDLE" ? viewPort.getPosition(event.clientX) - props.region.start : 0,
        });
    };
    const cleanup = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
    };
    createEffect(() => {
        if (state.initialRegion) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }
        else {
            cleanup();
        }
    });
    const onClickRegion = (event) => {
        props.onClickRegion?.(props.region, event);
    };
    onCleanup(() => cleanup());
    return (<Show when={virtualDimensions().size > 0}>
      <div class="Waveform-Region" style={{
            display: "flex",
            "justify-content": "space-between",
            position: "absolute",
            top: 0,
            height: "100%",
            opacity: 0.7,
            width: `${virtualDimensions().size}px`,
            left: `${virtualDimensions().offset}px`,
            "background-color": props.region.color,
        }}>
        <For each={regionDragHandles}>
          {(dragHandle) => (<RegionDragHandle handleName={dragHandle} onMouseDown={onDragHandleMouseDown}/>)}
        </For>
      </div>
    </Show>);
};
const RegionDragHandle = (props) => {
    return (<div style={{
            "border-left": "5px rgba(0, 0, 0, 0) solid",
            height: "100%",
            cursor: props.handleName === "MIDDLE" ? "move" : "col-resize",
            ...(props.handleName === "MIDDLE" && { flex: 1 }),
        }} onMouseDown={(event) => {
            props.onMouseDown(event, props.handleName);
        }}/>);
};
