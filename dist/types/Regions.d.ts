import { Region } from "./Region";
declare const Regions: (props: {
    regions?: Region[];
    onCreateRegion?: (region: Region) => void;
    onUpdateRegion?: (region: Region) => void;
    onClickRegion?: (region: Region, event: MouseEvent) => void;
    onDblClickRegion?: (region: Region, event: MouseEvent) => void;
}) => import("solid-js").JSX.Element;
export default Regions;
