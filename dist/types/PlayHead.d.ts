import { JSX } from "solid-js";
declare const PlayHead: (allProps: {
    playHeadPosition?: number;
    sync?: boolean;
    onPlayHeadPositionChange?: (playHeadPosition: number) => void;
} & JSX.HTMLAttributes<HTMLDivElement>) => JSX.Element;
export default PlayHead;
