import { delegateEvents, createComponent, insert, effect, setStyleProperty, style, template, spread, mergeProps as mergeProps$1, use } from 'solid-js/web';
import { createContext, useContext, createMemo, createEffect, onCleanup, Show, For, mergeProps, splitProps, createSignal, onMount, Index, createUniqueId } from 'solid-js';
import { createStore } from 'solid-js/store';

const createCachedWaveformSource = data => {
  const cache = {
    peak: new Map(),
    rms: new Map()
  };
  const getValues = async ({
    samplesPerPx,
    onProgress,
    start = 0,
    end = Math.ceil(data.length / samplesPerPx),
    mode = "peak"
  }) => {
    const peaks = [];

    // A non-finite or non-positive samplesPerPx (e.g. width 0 -> Infinity) makes
    // the default `end` Infinity/0 and recurses getValuesAtCached forever; bail.
    if (!Number.isFinite(samplesPerPx) || samplesPerPx <= 0 || !Number.isFinite(end)) {
      return peaks;
    }
    for (let x = start; x <= end; x++) {
      peaks.push(getValuesAtCached(samplesPerPx, x, mode));
      if (x % 10000 === 0 && onProgress) {
        onProgress?.(x / end);
        await new Promise(requestAnimationFrame);
      }
    }
    return peaks;
  };
  const getValuesAtCached = (samplesPerPx, x, mode) => {
    // Defensive: a non-finite samplesPerPx would recurse forever below.
    if (!Number.isFinite(samplesPerPx)) {
      return [0, 0];
    }
    if (samplesPerPx === 1) {
      return [data[x], data[x]];
    }
    const peaksArray = getOrCreatePeaksCache(samplesPerPx, mode);
    if (!peaksArray.has(x)) {
      const multiplicator = 2;
      const roughSamples = Math.ceil(samplesPerPx / multiplicator / 100) * 100;
      if (roughSamples > 100) {
        let min = 0;
        let max = 0;
        const start = Math.round(x * samplesPerPx / roughSamples);
        for (let i = 0; i < multiplicator; i++) {
          const value = getValuesAtCached(roughSamples, start + i, mode);
          if (value[1] > max) {
            max = value[1];
          }
          if (value[0] < min) {
            min = value[0];
          }
        }
        peaksArray.set(x, [min, max]);
      } else {
        peaksArray.set(x, getPeakAt(data, samplesPerPx, x, mode));
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return peaksArray.get(x);
  };
  const warmup = async (mode, onProgress) => {
    onProgress(1);
    const cachedSteps = Array.from({
      length: Math.ceil(data.length / 20000000)
    }).map((_, index) => {
      return (index + 2) * 100;
    });
    await cachedSteps.reduce(async (prev, samplesPerPx, i) => {
      await prev;
      await getValues({
        samplesPerPx,
        onProgress: progress => {
          onProgress((i + progress) / cachedSteps.length);
        },
        mode
      });
    }, Promise.resolve());
    onProgress(1);
  };
  const getOrCreatePeaksCache = (samplesPerPx, mode) => {
    if (!cache[mode].has(samplesPerPx)) {
      cache[mode].set(samplesPerPx, new Map());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache[mode].get(samplesPerPx);
  };
  return {
    warmup,
    getValues
  };
};
const getPeakAt = (data, samplesPerPx, x, mode) => {
  let max = 0;
  let min = 0;
  if (samplesPerPx <= 1) {
    if (mode === "peak") {
      const indexCeil = Math.ceil(x * samplesPerPx);
      const indexFloor = Math.floor(x * samplesPerPx);
      const ratio = x % 1;
      const valueCeil = data[indexCeil];
      const valueFloor = data[indexFloor];
      const value = valueCeil * ratio + valueFloor * (1 - ratio);
      return [value < 0 ? value : 0, value > 0 ? value : 0];
    } else {
      const index = Math.round(x * samplesPerPx);
      const value = data[index];
      return [value < 0 ? value : 0, value > 0 ? value : 0];
    }
  }
  for (let i = 0; i < samplesPerPx; i++) {
    const index = Math.floor(x * samplesPerPx) + i;
    if (index >= data.length) break;
    const value = data[index];
    if (mode === "peak") {
      if (value > max) {
        max = value;
      } else if (value < min) {
        min = value;
      }
    } else {
      if (value > max) {
        max += Math.pow(value, 2) / samplesPerPx;
      } else if (value < min) {
        min += Math.pow(value, 2) / samplesPerPx;
      }
    }
  }
  if (mode === "peak") {
    return [min, max];
  } else {
    return [-Math.sqrt(min), Math.sqrt(max)];
  }
};

const waveformContext = createContext({
  zoom: 0,
  duration: 0,
  position: 0,
  updatePosition: () => {},
  dimensions: {
    width: 0,
    height: 0,
    left: 0,
    top: 0
  }
}, {
  name: "Waveform"
});
const WaveformContextProvider = waveformContext.Provider;
const useWaveformContext = () => useContext(waveformContext);

const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};
function randomColor() {
  const randR = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const randG = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const randB = Math.floor(Math.random() * (255 - 0 + 1) + 0);
  const color = `rgba(${randR},${randG},${randB},0.8)`;
  return color;
}

function useViewPortScaler(getState) {
  const state = createMemo(() => getState());
  function getScaledValue(position) {
    const virtualSize = state().viewPortSize * state().zoom;
    return position / state().virtualRange * virtualSize;
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
    return {
      offset,
      size
    };
  }
  return {
    getScaledValue,
    getCoordinates,
    getPosition,
    getVirtualDimensions
  };
}

const useWaveformViewPortScaler = () => {
  const context = useWaveformContext();
  const viewPort = useViewPortScaler(() => ({
    virtualPosition: context.position,
    virtualRange: context.duration,
    viewPortOffset: context.dimensions.left,
    viewPortSize: context.dimensions.width,
    zoom: context.zoom
  }));
  return viewPort;
};

var _tmpl$$4 = /*#__PURE__*/template(`<div class=Waveform-Region style=display:flex;justify-content:space-between;position:absolute;top:0;height:100%;opacity:0.7>`),
  _tmpl$2$1 = /*#__PURE__*/template(`<div style="border-left:5px rgba(0, 0, 0, 0) solid;height:100%">`);
const regionDragHandles = ["LEFT", "MIDDLE", "RIGHT"];
const Region = props => {
  const viewPort = useWaveformViewPortScaler();
  const virtualDimensions = createMemo(() => viewPort.getVirtualDimensions(props.region.start, props.region.end - props.region.start));
  const [state, setState] = createStore({
    dragHandle: "LEFT",
    offset: 0
  });
  const handleMouseMove = event => {
    event.preventDefault();
    const position = viewPort.getPosition(event.clientX);
    if (!state.initialRegion) return;
    switch (state.dragHandle) {
      case "LEFT":
        props.onUpdateRegion?.({
          id: props.region.id,
          color: props.region.color,
          start: Math.min(position, state.initialRegion.end),
          end: Math.max(position, state.initialRegion.end)
        });
        break;
      case "RIGHT":
        props.onUpdateRegion?.({
          id: props.region.id,
          color: props.region.color,
          start: Math.min(position, state.initialRegion.start),
          end: Math.max(position, state.initialRegion.start)
        });
        break;
      case "MIDDLE":
        props.onUpdateRegion?.({
          id: props.region.id,
          color: props.region.color,
          start: position - state.offset,
          end: position - state.offset + (state.initialRegion.end - state.initialRegion.start)
        });
    }
  };
  const handleMouseUp = event => {
    setState({
      initialRegion: undefined
    });
    onClickRegion(event);
  };
  const onDragHandleMouseDown = (event, dragHandle) => {
    event.stopPropagation();
    setState({
      dragHandle,
      initialRegion: props.region,
      offset: dragHandle === "MIDDLE" ? viewPort.getPosition(event.clientX) - props.region.start : 0
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
    } else {
      cleanup();
    }
  });
  const onClickRegion = event => {
    props.onClickRegion?.(props.region, event);
  };
  onCleanup(() => cleanup());
  return createComponent(Show, {
    get when() {
      return virtualDimensions().size > 0;
    },
    get children() {
      var _el$ = _tmpl$$4();
      insert(_el$, createComponent(For, {
        each: regionDragHandles,
        children: dragHandle => createComponent(RegionDragHandle, {
          handleName: dragHandle,
          onMouseDown: onDragHandleMouseDown
        })
      }));
      effect(_p$ => {
        var _v$ = `${virtualDimensions().size}px`,
          _v$2 = `${virtualDimensions().offset}px`,
          _v$3 = props.region.color;
        _v$ !== _p$.e && setStyleProperty(_el$, "width", _p$.e = _v$);
        _v$2 !== _p$.t && setStyleProperty(_el$, "left", _p$.t = _v$2);
        _v$3 !== _p$.a && setStyleProperty(_el$, "background-color", _p$.a = _v$3);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined
      });
      return _el$;
    }
  });
};
const RegionDragHandle = props => {
  return (() => {
    var _el$2 = _tmpl$2$1();
    _el$2.$$mousedown = event => {
      props.onMouseDown(event, props.handleName);
    };
    effect(_$p => style(_el$2, {
      cursor: props.handleName === "MIDDLE" ? "move" : "col-resize",
      ...(props.handleName === "MIDDLE" && {
        flex: 1
      })
    }, _$p));
    return _el$2;
  })();
};
delegateEvents(["mousedown"]);

function drawSampleDots(ctx, peaks, radius) {
  peaks.forEach(([x1, avgMaxY], index) => {
    const [, lastPeakAvgMaxY] = peaks[index - 1] ?? [];
    const [, nextPeakAvgMaxY] = peaks[index + 1] ?? [];
    if (lastPeakAvgMaxY !== undefined && avgMaxY === lastPeakAvgMaxY && avgMaxY === nextPeakAvgMaxY) return;
    ctx.beginPath();
    ctx.arc(x1, avgMaxY, radius, 0, 360);
    ctx.closePath();
    ctx.fill();
  });
}
function drawPeaks(ctx, peaks) {
  ctx.beginPath();
  peaks.forEach(([x1, _, minY, maxY]) => {
    ctx.moveTo(x1, minY);
    ctx.lineTo(x1, maxY);
  });
  ctx.closePath();
  ctx.stroke();
}
function drawWaveform(ctx, peaks) {
  ctx.beginPath();
  for (let i = 0; i < peaks.length - 1; i++) {
    const [x1, y1] = peaks[i];
    const [x2, y2] = peaks[i + 1];
    const x_mid = (x1 + x2) / 2;
    const y_mid = (y1 + y2) / 2;
    const cp_x1 = (x_mid + x1) / 2;
    const cp_x2 = (x_mid + x2) / 2;
    ctx.quadraticCurveTo(cp_x1, y1, x_mid, y_mid);
    ctx.quadraticCurveTo(cp_x2, y2, x2, y2);
  }
  ctx.stroke();
}
const drawWaveformWithPeaks = async ({
  peaks,
  waveformStyle,
  peaksStyle,
  sampleDotsStyle,
  width,
  height,
  context,
  scale = 1,
  logScale = false
}) => {
  const startY = height / 2;
  const scaledPeaks = peaks.map(([min, max], i, peaks) => {
    const minValue = logScale ? -Math.log10(-min * 20) * 0.7 : min;
    const maxValue = logScale ? Math.log10(max * 20) * 0.7 : max;
    const x = i / peaks.length * width;
    const minY = startY + minValue * startY * scale;
    const maxY = startY + maxValue * startY * scale;
    const absMaxY = Math.abs(min) > Math.abs(max) ? minY : maxY;
    return [x, absMaxY, minY, maxY];
  });
  context.clearRect(0, 0, width, height);
  context.strokeStyle = waveformStyle?.strokeStyle ?? "rgb(0,0,0)";
  context.globalAlpha = waveformStyle?.opacity ?? 1;
  context.lineWidth = waveformStyle?.lineWidth ?? 1;
  if (context.globalAlpha) {
    drawWaveform(context, scaledPeaks);
  }
  context.strokeStyle = peaksStyle?.strokeStyle ?? "rgb(0,0,0)";
  context.globalAlpha = peaksStyle?.opacity ?? 1;
  context.lineWidth = peaksStyle?.lineWidth ?? 1;
  if (context.globalAlpha) {
    drawPeaks(context, scaledPeaks);
  }
  context.fillStyle = sampleDotsStyle?.fillStyle ?? "rgb(0,0,0)";
  context.globalAlpha = sampleDotsStyle?.opacity ?? 1;
  if (context.globalAlpha) {
    drawSampleDots(context, scaledPeaks, sampleDotsStyle?.radius ?? 3);
  }
};

var _tmpl$$3 = /*#__PURE__*/template(`<div class=Waveform-Spinner style=display:flex;position:absolute;left:0;top:0;width:100%;height:100%;justify-content:center;align-items:center;background:rgba(0,0,0,0.1)>`),
  _tmpl$2 = /*#__PURE__*/template(`<div class=Waveform><canvas style=position:absolute;left:0;top:0;width:100%;height:100%></canvas><div class=Waveform-Scroller style=position:absolute;left:0;bottom:0;width:100%;height:16px;z-index:2;overflow-x:auto><div class=Waveform-ScrollbarDiv style=height:100%;position:relative></div></div><div class=Waveform-ContentContainer style=position:absolute;left:0;bottom:0;width:100%;height:100%;z-index:1;overflow-x:hidden;touch-action:none><div class=Waveform-Content style=height:100%;position:relative>`);
const Waveform = allProps => {
  const propsWithDefauls = mergeProps({
    logScale: false,
    mode: "peak",
    lineWidth: 1
  }, allProps);
  const [props, divProps] = splitProps(propsWithDefauls, ["strokeStyle", "buffer", "position", "zoom", "scale", "logScale", "mode", "lineWidth", "onScaleChange", "onPositionChange", "onZoomChange", "children"]);
  let scrollbarDivRef;
  let canvasRef;
  let context;
  const rawData = createMemo(() => props.buffer?.getChannelData(0));
  const duration = createMemo(() => props.buffer?.duration ?? 0);
  const endTime = createMemo(() => props.position + duration() / props.zoom);
  const dataLength = createMemo(() => rawData()?.length ?? 0);
  const visibleLength = createMemo(() => Math.min((endTime() - props.position) / duration() * dataLength(), dataLength()));
  const [canvasDimensions, setCanvasDimensions] = createSignal({
    height: 0,
    width: 0,
    left: 0,
    top: 0
  });
  const cachedWaveformPeaks = createMemo(() => createCachedWaveformSource(rawData() ?? []));
  const [progress, setProgress] = createSignal(0);
  const updateDimensions = () => {
    const {
      width = 0,
      height = 0,
      left = 0,
      top = 0
    } = canvasRef?.getBoundingClientRect() ?? {};
    setCanvasDimensions({
      width,
      height,
      left,
      top
    });
  };
  const observer = new ResizeObserver(updateDimensions);
  onMount(() => {
    context = canvasRef?.getContext("2d") ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.observe(canvasRef);
    updateDimensions();
  });
  onCleanup(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.unobserve(canvasRef);
  });
  createEffect(() => {
    if (!context) return;
    const {
      height,
      width
    } = canvasDimensions();
    const dpi = window.devicePixelRatio;
    canvasRef?.setAttribute("width", (width * dpi).toString());
    canvasRef?.setAttribute("height", (height * dpi).toString());
    context.scale(dpi, dpi);
  });
  let animationFrame;
  let animationFrameScheduleTime = 0;
  createEffect(() => {
    if (!dataLength()) return;
    if (!context) return;
    const {
      height,
      width
    } = canvasDimensions();
    // Canvas not measured yet (ResizeObserver hasn't fired): a width of 0 makes
    // samplesPerPx Infinity, which overflows the peak-cache recursion. Wait
    // until the canvas has a real size before drawing.
    if (!width || !height) return;
    const samplesPerPx = visibleLength() / width;
    if (!Number.isFinite(samplesPerPx) || samplesPerPx <= 0) return;
    const start = Math.floor(props.position / duration() * (dataLength() / samplesPerPx));
    const end = start + width;
    const peaksOpacity = clamp(Math.log(samplesPerPx / 35) - 0.5, 0, 1);
    const scale = props.scale;
    const strokeStyle = props.strokeStyle;
    const logScale = props.logScale;
    const mode = props.mode;
    const sampleDotsOpacity = samplesPerPx < 100 / width ? 1 : 0;
    const now = window.performance.now();
    if (now - animationFrameScheduleTime < 0.5) {
      cancelAnimationFrame(animationFrame);
    }
    animationFrameScheduleTime = now;
    animationFrame = requestAnimationFrame(async () => {
      if (!context) return;
      const peaks = await cachedWaveformPeaks().getValues({
        samplesPerPx,
        start,
        end,
        mode
      });
      drawWaveformWithPeaks({
        context,
        peaks,
        width,
        height,
        scale,
        peaksStyle: {
          opacity: peaksOpacity,
          strokeStyle,
          lineWidth: devicePixelRatio * props.lineWidth
        },
        waveformStyle: {
          opacity: 1 - peaksOpacity,
          strokeStyle,
          lineWidth: devicePixelRatio * props.lineWidth
        },
        sampleDotsStyle: {
          opacity: sampleDotsOpacity,
          fillStyle: strokeStyle,
          radius: props.lineWidth * devicePixelRatio * 2
        },
        logScale
      });
    });
  });
  const handleWheel = event => {
    event.preventDefault();
    const {
      width,
      height,
      left
    } = canvasDimensions();
    const deltaX = event.altKey ? event.deltaY : event.deltaX;
    const deltaY = event.altKey ? event.deltaX : event.deltaY;
    if (event.shiftKey) {
      const newScale = clamp(props.scale * (1 + deltaY / height), 0.1, 5);
      props.onScaleChange?.(newScale);
    } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const maxPosition = duration() - duration() / props.zoom;
      const newPosition = clamp(props.position + deltaX / width / props.zoom * 1000, 0, maxPosition);
      props.onPositionChange?.(newPosition);
    } else {
      const maxZoom = dataLength() / width * 50 * window.devicePixelRatio;
      const newZoom = clamp(props.zoom * (1 + deltaY / height), 1, maxZoom);
      const zoomedLength = duration() / props.zoom;
      const pointerPositionPercentage = (event.clientX - left) / width;
      const pointerPosition = props.position + zoomedLength * pointerPositionPercentage;
      const newZoomedLength = duration() / newZoom;
      const maxPosition = duration() - duration() / newZoom;
      const newPosition = clamp(pointerPosition - pointerPositionPercentage * newZoomedLength, 0, maxPosition);
      props.onZoomChange?.(newZoom);
      props.onPositionChange?.(newPosition);
    }
  };
  const handleScroll = event => {
    event.preventDefault();
    if (didUpdateScrollLeft) {
      didUpdateScrollLeft = false;
      return;
    }
    const maxPosition = duration() - duration() / props.zoom;
    const {
      width
    } = canvasDimensions();
    const {
      scrollLeft,
      scrollWidth
    } = event.currentTarget;
    const scrollAmount = scrollLeft / (scrollWidth - width);
    props.onPositionChange?.(maxPosition * scrollAmount);
  };
  let didUpdateScrollLeft = false;
  createEffect(() => {
    const maxPosition = duration() - duration() / props.zoom;
    const scrollAmount = maxPosition > 0 ? props.position / maxPosition : 0;
    const {
      width
    } = canvasDimensions();
    if (!scrollbarDivRef?.parentElement) return;
    const scrollDivWidth = clamp(props.zoom * width, width, 10000);
    const scrollLeft = scrollAmount * (scrollDivWidth - width);
    didUpdateScrollLeft = true;
    scrollbarDivRef.parentElement.scrollTo(scrollLeft, 0);
    scrollbarDivRef.style.width = `${scrollDivWidth}px`;
  });
  createEffect(() => {
    cachedWaveformPeaks().warmup(props.mode, progress => setProgress(progress));
  });
  const getContextValue = () => ({
    duration: duration(),
    position: props.position,
    zoom: props.zoom,
    updatePosition: props.onPositionChange,
    dimensions: canvasDimensions()
  });
  const [contextValue, setContextValue] = createStore(getContextValue());
  createEffect(() => {
    setContextValue(getContextValue());
  });
  return (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild,
      _el$4 = _el$2.nextSibling,
      _el$5 = _el$4.firstChild,
      _el$6 = _el$4.nextSibling,
      _el$7 = _el$6.firstChild;
    spread(_el$, mergeProps$1(divProps, {
      get style() {
        return {
          ...(typeof divProps.style === "object" && divProps.style),
          position: "relative"
        };
      },
      "onWheel": handleWheel
    }), false, true);
    var _ref$ = canvasRef;
    typeof _ref$ === "function" ? use(_ref$, _el$2) : canvasRef = _el$2;
    insert(_el$, createComponent(Show, {
      get when() {
        return !(progress() === 0 || progress() === 1);
      },
      get children() {
        return _tmpl$$3();
      }
    }), _el$4);
    _el$4.addEventListener("scroll", handleScroll);
    var _ref$2 = scrollbarDivRef;
    typeof _ref$2 === "function" ? use(_ref$2, _el$5) : scrollbarDivRef = _el$5;
    insert(_el$7, createComponent(WaveformContextProvider, {
      value: contextValue,
      get children() {
        return props.children;
      }
    }));
    return _el$;
  })();
};

var _tmpl$$2 = /*#__PURE__*/template(`<div><canvas style=position:absolute;left:0;top:0;width:100%;height:100%>`);
const Oscilloscope = allProps => {
  const propsWithDefaults = mergeProps(allProps, {
    slowNessFactor: 250,
    scale: 1,
    mode: "peak",
    lineWidth: 1,
    strokeStyle: "rgb(0,0,0)"
  });
  const [props, divProps] = splitProps(propsWithDefaults, ["analyzerNode", "slowNessFactor", "scale", "mode", "lineWidth", "strokeStyle"]);
  let animationFrame;
  let canvasRef;
  let context;
  let dimensions;
  const dataArray = createMemo(() => new Float32Array(props.analyzerNode.frequencyBinCount));
  let lastDraw = 0;
  let peaks = [];
  const draw = () => {
    animationFrame = requestAnimationFrame(draw);
    const now = Date.now();
    const timePassedSinceLastRender = now - lastDraw;
    if (!dimensions?.width || !context) return;
    lastDraw = now;
    const percentage = props.slowNessFactor > 0 ? timePassedSinceLastRender / props.slowNessFactor : 1;
    const data = dataArray();
    const {
      width,
      height
    } = dimensions;
    const dpi = window.devicePixelRatio;
    canvasRef?.setAttribute("width", (width * dpi).toString());
    canvasRef?.setAttribute("height", (height * dpi).toString());
    context.scale(dpi, dpi);
    props.analyzerNode.getFloatTimeDomainData(data);
    const samplesPerPx = data.length / dimensions.width;
    const previousPeaks = peaks;
    peaks = [];
    for (let x = 0; x < dimensions.width; x++) {
      const peak = getPeakAt(data, samplesPerPx, x, props.mode);
      const previousPeak = previousPeaks?.[x] ?? [0, 0];
      peaks.push([peak[0] * percentage + previousPeak[0] * (1 - percentage), peak[1] * percentage + previousPeak[1] * (1 - percentage)]);
    }
    drawWaveformWithPeaks({
      context,
      peaks,
      peaksStyle: {
        opacity: clamp(Math.log(samplesPerPx / 35) - 0.5, 0, 1),
        lineWidth: props.lineWidth * devicePixelRatio,
        strokeStyle: props.strokeStyle
      },
      waveformStyle: {
        lineWidth: props.lineWidth * devicePixelRatio,
        strokeStyle: props.strokeStyle
      },
      sampleDotsStyle: {
        opacity: 0,
        fillStyle: props.strokeStyle
      },
      logScale: true,
      scale: props.scale,
      width,
      height
    });
  };
  const updateDimensions = () => {
    dimensions = canvasRef?.getBoundingClientRect();
  };
  onMount(() => {
    context = canvasRef?.getContext("2d") ?? undefined;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.observe(canvasRef);
    updateDimensions();
    draw();
  });
  onCleanup(() => {
    cancelAnimationFrame(animationFrame);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    observer.unobserve(canvasRef);
  });
  const observer = new ResizeObserver(() => {});
  return (() => {
    var _el$ = _tmpl$$2(),
      _el$2 = _el$.firstChild;
    spread(_el$, mergeProps$1(divProps, {
      get style() {
        return {
          ...(typeof divProps.style === "object" && divProps.style),
          position: "relative"
        };
      }
    }), false, true);
    var _ref$ = canvasRef;
    typeof _ref$ === "function" ? use(_ref$, _el$2) : canvasRef = _el$2;
    return _el$;
  })();
};

var _tmpl$$1 = /*#__PURE__*/template(`<div class=Waveform-Regions style=position:absolute;left:0;top:0;width:100%;height:100%>`);
const Regions = props => {
  const [newRegion, setNewRegion] = createSignal();
  const context = useWaveformContext();
  const viewPort = useWaveformViewPortScaler();
  const handleMouseDown = event => {
    if (props.regions === undefined) return;
    event.stopPropagation();
    event.preventDefault();
    const mouseDownPosition = viewPort.getPosition(event.clientX);
    const onMouseMove = event => {
      const mouseMovePosition = viewPort.getPosition(event.clientX);
      const createdRegion = newRegion();
      if (!createdRegion) {
        const id = createUniqueId();
        const color = randomColor();
        const region = {
          id,
          color,
          start: Math.min(mouseDownPosition, mouseMovePosition),
          end: Math.max(mouseDownPosition, mouseMovePosition)
        };
        setNewRegion(region);
        props.onCreateRegion?.(region);
      } else {
        const region = {
          ...createdRegion,
          start: Math.min(mouseDownPosition, mouseMovePosition),
          end: Math.max(mouseDownPosition, mouseMovePosition)
        };
        props.onUpdateRegion?.(region);
      }
    };
    const onMouseUp = () => {
      setNewRegion(undefined);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  return (() => {
    var _el$ = _tmpl$$1();
    _el$.$$mousedown = handleMouseDown;
    insert(_el$, createComponent(Index, {
      get each() {
        return props.regions;
      },
      children: region => createComponent(Region, {
        get region() {
          return region();
        },
        get duration() {
          return context.duration;
        },
        get onUpdateRegion() {
          return props.onUpdateRegion;
        },
        get onClickRegion() {
          return props.onClickRegion;
        },
        get onDblClickRegion() {
          return props.onDblClickRegion;
        }
      })
    }));
    return _el$;
  })();
};
delegateEvents(["mousedown"]);

var _tmpl$ = /*#__PURE__*/template(`<div class=PlayHead>`);
const PlayHead = allProps => {
  const propsWithDefauls = mergeProps({
    playHeadPosition: 0,
    sync: false
  }, allProps);
  const [props, divProps] = splitProps(propsWithDefauls, ["playHeadPosition", "sync", "onPlayHeadPositionChange"]);
  const context = useWaveformContext();
  const viewPort = useWaveformViewPortScaler();
  createEffect(() => {
    if (!props.sync) return;
    const maxPosition = context.duration - context.duration / context.zoom;
    const newPosition = clamp(props.playHeadPosition - context.duration / context.zoom / 2, 0, maxPosition);
    context.updatePosition?.(newPosition);
  });
  const leftPosition = createMemo(() => viewPort.getCoordinates(props.playHeadPosition));
  return (() => {
    var _el$ = _tmpl$();
    spread(_el$, mergeProps$1(divProps, {
      get style() {
        return {
          position: "absolute",
          height: "100%",
          width: "2px",
          left: `${leftPosition()}px`,
          "background-color": "green",
          cursor: "pointer",
          ...(typeof divProps.style === "object" && divProps.style)
        };
      },
      "onMouseDown": event => {
        event.preventDefault();
        event.stopPropagation();
        const handleMouseMove = ({
          movementX
        }) => {
          const {
            parentElement
          } = event.currentTarget;
          if (!parentElement) return;
          const newPosition = viewPort.getPosition(leftPosition() + movementX);
          props.onPlayHeadPositionChange?.(newPosition);
        };
        const handleMouseUp = () => {
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);
        };
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      }
    }), false, false);
    return _el$;
  })();
};

export { Oscilloscope, PlayHead, Region, Regions, Waveform, createCachedWaveformSource as createCachedWaveformPeaks };
//# sourceMappingURL=index.js.map
