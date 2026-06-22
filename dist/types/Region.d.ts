export type Region = {
    id: string;
    color: string;
    start: number;
    end: number;
};
export declare const Region: (props: {
    region: Region;
    duration: number;
    onUpdateRegion?: (region: Region) => void;
    onClickRegion?: (region: Region, event: MouseEvent) => void;
    onDblClickRegion?: (region: Region, event: MouseEvent) => void;
}) => import("solid-js").JSX.Element;
