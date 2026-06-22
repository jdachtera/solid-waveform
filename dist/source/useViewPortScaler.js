import { createMemo } from "solid-js";
import { clamp } from "./helpers";
export default function useViewPortScaler(getState) {
    const state = createMemo(() => getState());
    function getScaledValue(position) {
        const virtualSize = state().viewPortSize * state().zoom;
        return (position / state().virtualRange) * virtualSize;
    }
    function getCoordinates(position) {
        return getScaledValue(position) - getScaledValue(state().virtualPosition);
    }
    function getPosition(offset) {
        const visibleDuration = state().virtualRange / state().zoom;
        const percentX = (offset - state().viewPortOffset) / state().viewPortSize;
        const position = state().virtualPosition + percentX * visibleDuration;
        return position;
    }
    function getVirtualDimensions(position, length) {
        const virtualLeft = getCoordinates(position);
        const virtualWidth = getScaledValue(length);
        const offset = clamp(virtualLeft, 0, state().viewPortSize);
        const size = clamp(virtualWidth - (offset - virtualLeft), 0, state().viewPortSize - offset);
        return { offset, size };
    }
    return {
        getScaledValue,
        getCoordinates,
        getPosition,
        getVirtualDimensions,
    };
}
