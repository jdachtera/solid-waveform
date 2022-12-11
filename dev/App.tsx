import { Component, createResource, createSignal, For, Index, untrack } from "solid-js";

import styles from "./App.module.css";
import { Region, Waveform, Oscilloscope } from "../src";

const App: Component = () => {
  let audioSource: AudioBufferSourceNode | undefined;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

  const gainNode = new GainNode(audioCtx, {
    gain: 0.5,
  });

  const analyser = new AnalyserNode(audioCtx, {
    smoothingTimeConstant: 1,
    fftSize: 8192,
  });

  gainNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  const [url, setUrl] = createSignal("/jam_session.m4a");
  const [inputUrl, setInputUrl] = createSignal(untrack(() => url()));

  const [audioBuffer] = createResource(url, async (url) => {
    const context = new AudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return context.decodeAudioData(arrayBuffer);
  });

  const [position, setPosition] = createSignal(0);
  const [zoom, setZoom] = createSignal(1);
  const [scale, setScale] = createSignal(1);
  const [logScale, setLogScale] = createSignal(false);
  const [regions, setRegions] = createSignal<Region[]>([]);

  const playRegion = (region: Region) => {
    audioSource?.stop();
    audioSource = new AudioBufferSourceNode(audioCtx, {
      buffer: audioBuffer(),
    });
    audioSource.connect(gainNode);
    audioSource.start(0, region.start, region.end - region.start);
  };

  return (
    <div class={styles.App}>
      <h1>Solid Waveform</h1>
      <Waveform
        style={{ height: "300px" }}
        buffer={audioBuffer()}
        position={position()}
        regions={regions()}
        zoom={zoom()}
        scale={scale()}
        logScale={logScale()}
        onPositionChange={setPosition}
        onZoomChange={setZoom}
        onScaleChange={setScale}
        onUpdateRegion={(region) => {
          const index = regions().findIndex(({ id }) => id === region.id);
          setRegions([...regions().slice(0, index), region, ...regions().slice(index + 1)]);
        }}
        onCreateRegion={(region) => {
          setRegions([...regions(), region]);
        }}
        onClickRegion={playRegion}
        strokeStyle="#121212"
      />

      <Oscilloscope style={{ height: "300px" }} analyzerNode={analyser}></Oscilloscope>

      <h2>Info:</h2>
      <button onClick={() => audioSource?.stop()}>Stop Audio</button>
      <div>
        <label>Audio URL:</label>
        <input value={inputUrl()} onChange={(event) => setInputUrl(event.currentTarget.value)} />
        <button onClick={() => setUrl(inputUrl())}>Update</button>
      </div>

      <div>
        <label>Position:</label>
        <input value={position().toFixed(3)} />
      </div>

      <div>
        <label>Zoom:</label>
        <input value={zoom().toFixed(3)} />
      </div>

      <div>
        <label>Scale:</label>
        <input value={scale().toFixed(3)} />
      </div>

      <div>
        <label>
          Logarithmic
          <input type="checkbox" checked={logScale()} onChange={() => setLogScale(!logScale())} />
        </label>
      </div>

      <h2>Regions:</h2>
      <table style={{ width: "500px" }}>
        <thead>
          <tr>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <Index each={regions()}>
            {(region) => (
              <tr>
                <td>{region().start.toFixed(3)}</td>
                <td>{region().end.toFixed(3)}</td>
                <td>{(region().end - region().start).toFixed(3)}</td>
                <td>
                  <button onClick={() => playRegion(region())}>Play</button>
                </td>
              </tr>
            )}
          </Index>
        </tbody>
      </table>
    </div>
  );
};

export default App;
