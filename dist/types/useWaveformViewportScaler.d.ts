declare const useWaveformViewPortScaler: () => {
    getScaledValue: (position: number) => number;
    getCoordinates: (position: number) => number;
    getPosition: (offset: number) => number;
    getVirtualDimensions: (position: number, length: number) => {
        offset: number;
        size: number;
    };
};
export default useWaveformViewPortScaler;
