export default function useViewPortScaler(getState: () => {
    virtualPosition: number;
    virtualRange: number;
    viewPortOffset: number;
    viewPortSize: number;
    zoom: number;
}): {
    getScaledValue: (position: number) => number;
    getCoordinates: (position: number) => number;
    getPosition: (offset: number) => number;
    getVirtualDimensions: (position: number, length: number) => {
        offset: number;
        size: number;
    };
};
